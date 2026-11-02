// Elektronische Unterschrift – Endfassung von Hand im DMS ablegen (sign-request „dms_ablegen“).
// Seit 02.11.2026 legt der Abschluss ausgehender Vorgänge nicht mehr selbst ab (nur ETV-Protokolle).
// Das Büro wählt auf /unterschriften Objekt bzw. Firmen-DMS, Ordner und Dateinamen – vorgeschlagen
// von dms-vorschlag (sign_requests.dms_vorschlag) – und legt final.pdf hier ab.
//
// Speicherschema wie bisher:
//   Objekt:     building-files/{building_id}/unterschriften/{nummer}/{datei}
//   Firmen-DMS: building-files/rgi/unterschriften/{nummer}/{datei}  (is_company, nur Administratoren)
import { BUCKET, Fehler, dateiname, ereignis, laden, pfadSegment, uuidOderNull, zeile } from "./basis.ts";
import type { Db } from "./basis.ts";
import { vorgangLaden } from "./ablauf.ts";
import { istAdmin } from "./vorgang.ts";

// deno-lint-ignore no-explicit-any
type Body = any;

const SICHTBARKEIT = ["intern", "alle", "eigentuemer", "mieter"];

export async function dmsAblegen(db: Db, b: Body, userId: string | null) {
  if (!userId) throw new Fehler(400, "Kein angemeldeter Mitarbeiter.");
  const { req: v } = await vorgangLaden(db, String(b.request_id || ""));
  if (v.typ !== "ausgehend") throw new Fehler(400, "Nur ausgehende Vorgänge werden hier abgelegt (ETV-Protokolle und eigene Unterschriften legen sich selbst ab).");
  if (v.status !== "abgeschlossen" || !v.final_path) throw new Fehler(409, "Die Endfassung liegt erst vor, wenn alle unterschrieben haben.");

  // Mehrfachablage nur bewusst („erneut ablegen“)
  if (v.final_file_id && b.erneut !== true) {
    const { data: alt } = await db.from("building_files").select("id, deleted_at").eq("id", v.final_file_id).maybeSingle();
    if (alt && !alt.deleted_at) throw new Fehler(409, "Die Endfassung ist bereits im DMS abgelegt.");
  }

  const firma = b.building_id === null || b.building_id === "" || b.building_id === "rgi";
  const buildingId = firma ? null : uuidOderNull(b.building_id);
  if (!firma && !buildingId) throw new Fehler(400, "Bitte ein Objekt wählen.");
  if (firma && !(await istAdmin(db, userId))) throw new Fehler(403, "Im Firmen-DMS dürfen nur Administratoren ablegen.");

  // deno-lint-ignore no-explicit-any
  let gebaeude: any = null;
  if (buildingId) {
    const { data } = await db.from("buildings").select("id, name, management_mode").eq("id", buildingId).maybeSingle();
    if (!data) throw new Fehler(404, "Objekt nicht gefunden.");
    gebaeude = data;
  }

  // Ordner muss zum Ziel gehören (Objekt-Ordner bzw. Firmen-Ordner)
  const categoryId = b.category_id ? uuidOderNull(b.category_id) : null;
  if (b.category_id && !categoryId) throw new Fehler(400, "Ungültiger Ordner.");
  let ordner: string | null = null;
  let ordnerSlug: string | null = null;
  if (categoryId) {
    const { data: k } = await db.from("building_file_categories").select("id, name, slug, building_id, is_company").eq("id", categoryId).maybeSingle();
    const passt = k && (firma ? k.is_company === true : k.is_company !== true && k.building_id === buildingId);
    if (!passt) throw new Fehler(400, "Der Ordner gehört nicht zum gewählten Ziel.");
    ordner = k.name;
    ordnerSlug = k.slug ?? null;
  }

  const name = dateiname(zeile(b.dateiname, 140) || `${v.titel} (unterschrieben)`);
  const sichtbarkeit = firma ? "intern" : SICHTBARKEIT.includes(b.sichtbarkeit) ? b.sichtbarkeit : "intern";
  const bytes = await laden(db, v.final_bucket || BUCKET, v.final_path);

  const ziel = `${firma ? "rgi" : buildingId}/unterschriften/${pfadSegment(v.nummer)}/${pfadSegment(name)}`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(ziel, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Fehler(500, `Datei konnte nicht gespeichert werden: ${upErr.message}`);

  const { data: bf, error } = await db.from("building_files").insert({
    building_id: buildingId,
    is_company: firma,
    uploaded_by: userId,
    category_id: categoryId,
    display_name: name,
    description: `Elektronisch unterschrieben (Textform § 126b BGB) · ${v.nummer}${v.final_sha256 ? ` · SHA-256 ${v.final_sha256}` : ""}`,
    file_path: ziel,
    file_size: bytes.byteLength,
    mime_type: "application/pdf",
    fiscal_year: null,
    management_mode: gebaeude?.management_mode || "weg",
    source: "manual",
    storage_bucket: BUCKET,
    rag_enabled: !firma,
    visibility_role: sichtbarkeit,
    visible_to_users: sichtbarkeit !== "intern",
    benachrichtigen: sichtbarkeit !== "intern" && b.benachrichtigen === true,
    tags: ["unterschrieben", "e-signatur", v.dokumentart],
  }).select("id").single();
  if (error) {
    await db.storage.from(BUCKET).remove([ziel]);
    throw new Fehler(500, `DMS-Eintrag konnte nicht angelegt werden: ${error.message}`);
  }

  // Gegen doppeltes Ablegen (zwei Klicks/zwei Mitarbeiter): final_file_id nur setzen, wenn unverändert
  const erneut = !!v.final_file_id;
  let sperre = db.from("sign_requests").update({ final_file_id: bf.id }).eq("id", v.id);
  sperre = erneut ? sperre.eq("final_file_id", v.final_file_id) : sperre.is("final_file_id", null);
  const { data: gesetzt } = await sperre.select("id");
  if (!gesetzt?.length) {
    await db.from("building_files").delete().eq("id", bf.id);
    await db.storage.from(BUCKET).remove([ziel]);
    throw new Fehler(409, "Die Endfassung wurde gerade schon abgelegt.");
  }

  await db.from("building_file_activity").insert({
    file_id: bf.id,
    user_id: userId,
    action: "imported_from_signature",
    details: { sign_request_id: v.id, nummer: v.nummer },
  });

  // Rückmeldung zum Vorschlag (übernommen oder geändert) – wie dms_vorschlaege im Postfach
  const vs = v.dms_vorschlag && typeof v.dms_vorschlag === "object" ? v.dms_vorschlag : null;
  let geaendert: boolean | null = null;
  if (vs) {
    const vorschlagFirma = vs.ziel === "firma";
    // Objekt-Ordner werden per Schlüssel (slug) vorgeschlagen, Firmen-Ordner per ID
    const ordnerAnders = firma ? (vs.category_id ?? null) !== categoryId : (vs.category_slug ?? null) !== ordnerSlug;
    geaendert = vorschlagFirma !== firma || (!firma && vs.building_id !== buildingId) || ordnerAnders || (vs.dateiname ?? null) !== name;
  }

  const zielName = firma ? "RGI Immobilien (Firmen-DMS)" : gebaeude.name;
  if (vs) {
    await db.from("sign_requests").update({ dms_vorschlag: { ...vs, abgelegt_am: new Date().toISOString(), geaendert } }).eq("id", v.id);
  }
  await ereignis(db, v.id, "dms_abgelegt", `Endfassung ${erneut ? "erneut " : ""}im DMS abgelegt: ${zielName}${ordner ? ` › ${ordner}` : ""}`, {
    userId,
    details: {
      file_id: bf.id,
      building_id: buildingId,
      firma,
      ziel: zielName,
      ordner,
      category_id: categoryId,
      dateiname: name,
      ...(erneut ? { vorher_file_id: v.final_file_id } : {}),
      ...(geaendert !== null ? { vorschlag_geaendert: geaendert } : {}),
    },
  });
  return { ok: true, file_id: bf.id, ziel: zielName, ordner, dateiname: name, building_id: buildingId, firma };
}
