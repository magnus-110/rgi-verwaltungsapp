// Dokumente erstellen über den Claude-Konnektor – mit denselben Funktionen wie die App
// (gleiche Vorlagen, gleiche Berechnung). Jedes Ergebnis kann
//   - im Chat ankommen (Download-Link, 24 Std.),
//   - ins DMS des Objekts gelegt werden (Standard: intern, ohne Benachrichtigung),
//   - als Anhang für mail_entwurf_anlegen / mail_senden dienen (anhaenge[]),
//   - als persönlicher Anhang je Eigentümer an eine Rundmail gehängt werden.
// Ab GRENZE Dokumenten wird erst nachgefragt (bestaetigt=true), weil die PDF-Umwandlung je Datei kostet.
import PizZip from "https://esm.sh/pizzip@3.1.7";
import { loadRecipients } from "../_shared/comm-vars.ts";
import { einheitKey, rundmailAnhaengeZuordnen, rundmailEntwurfLaden } from "../_shared/rundmail-anhaenge.ts";

export const GRENZE = 50;

type Tool = { name: string; description: string; inputSchema: any; annotations?: any; run: (a: any) => Promise<unknown> };
type Deps = {
  db: any;
  log: (tool: string, d: Record<string, unknown>) => Promise<void>;
  dmsEintragAnlegen: (a: any) => Promise<any>;
  mimeVon: (name: string, given?: string) => string;
  uploaderId: (email?: string) => Promise<string>;
};

/** Eine erzeugte Datei */
export type Datei = {
  name: string;
  bytes: Uint8Array;
  mime?: string;
  /** Einheiten, für die das Dokument ist (für Rundmail und Freigabe im Portal) */
  einheiten?: string[];
  /** Kontakte, die das Dokument im Portal sehen sollen (bei freigeben=true) */
  kontakt_ids?: string[];
  /** DMS-Ordner (Slug), sonst der Ordner der Art */
  kategorie?: string;
};

const S = (props: Record<string, any>, required: string[] = []) => ({ type: "object", properties: props, required, additionalProperties: false });
const str = (d: string) => ({ type: "string", description: d });
const uuid = (d: string) => ({ type: "string", format: "uuid", description: d });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ARTEN: Record<string, { titel: string; kategorie: string; braucht: string; hinweis: string }> = {
  vorlagenbrief: {
    titel: "Brief aus einer Word-Vorlage (Serienbrief)",
    kategorie: "schriftverkehr-serienbriefe",
    braucht: "building_id, vorlage_id (aus dokument_vorlagen); optional empfaenger_rolle, assignment_ids, einheiten, freie_felder, meeting_id",
    hinweis: "Ein Brief je Empfänger. Freie Felder füllen Platzhalter wie {{betreff}} / {{brieftext}} – so geht auch ein freier Brief auf Briefpapier.",
  },
  etv_einladung: {
    titel: "Einladung zur Eigentümerversammlung",
    kategorie: "versammlung",
    braucht: "meeting_id (aus etv_versammlungen); optional vorlage_id, assignment_ids, einheiten",
    hinweis: "Gleiche Vorlage wie 'Einladungen erstellen' in der App (objektbezogen, sonst allgemein). Ein PDF je Eigentümer.",
  },
  protokoll: {
    titel: "Protokoll der Eigentümerversammlung",
    kategorie: "versammlung-protokolle",
    braucht: "meeting_id",
    hinweis: "Mit Unterschriftenseite (vorhandene Unterschriften werden eingefügt).",
  },
  versammlungsbericht: {
    titel: "Bericht zu einem Tagesordnungspunkt",
    kategorie: "versammlung",
    braucht: "agenda_item_id (TOP mit Berichtsteilen)",
    hinweis: "Standard-Berichtsvorlage.",
  },
  angebot: {
    titel: "Verwalter-Angebot (RGI)",
    kategorie: "rgi-angebote",
    braucht: "offer_id",
    hinweis: "Erzeugt das Angebot neu als PDF (wie 'Angebot erstellen' in der App).",
  },
  rgi_rechnung: {
    titel: "RGI-Rechnung",
    kategorie: "rgi-buchhaltung",
    braucht: "invoice_id (rgi_invoices)",
    hinweis: "Liefert das vorhandene PDF der Rechnung. Neu erzeugt wird nur, wenn noch keines existiert.",
  },
  jahresabrechnung: {
    titel: "Jahresabrechnung (Einzelabrechnungen und Gesamtabrechnung)",
    kategorie: "jahresbericht-einzelabrechnung",
    braucht: "building_id, wirtschaftsjahr; optional einheiten, nur_gesamt",
    hinweis: "Gleiche Berechnung und Vorlage wie in der App (Buchhaltung › Abrechnung).",
  },
  wirtschaftsplan: {
    titel: "Wirtschaftsplan (Einzelwirtschaftspläne und Gesamtwirtschaftsplan)",
    kategorie: "jahresbericht-einzel-wp",
    braucht: "building_id, wirtschaftsjahr; optional einheiten, nur_gesamt",
    hinweis: "Gleiche Berechnung wie im Wirtschaftsplan-Editor der App.",
  },
  bescheinigung_35a: {
    titel: "§ 35a EStG-Bescheinigungen",
    kategorie: "jahresbericht-35a",
    braucht: "building_id, wirtschaftsjahr; optional einheiten",
    hinweis: "Gleiche Berechnung und Vorlage wie in der App. Eine Bescheinigung je Eigentümer.",
  },
};

export function dokumentTools(d: Deps): Tool[] {
  const { db, log } = d;

  // ------------------------------------------------------------ Helfer
  async function funktion(name: string, body: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const r: any = await res.json().catch(() => ({}));
    if (!res.ok || r?.error) throw new Error(`${name}: ${r?.error ?? `Fehler ${res.status}`}${r?.details ? ` – ${JSON.stringify(r.details).slice(0, 400)}` : ""}`);
    return r;
  }

  async function laden(bucket: string, path: string): Promise<Uint8Array> {
    const { data, error } = await db.storage.from(bucket).download(path);
    if (error || !data) throw new Error(`Datei konnte nicht geladen werden: ${path}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  function zipAuspacken(bytes: Uint8Array): { name: string; bytes: Uint8Array }[] {
    const zip = new PizZip(bytes);
    return (Object.values(zip.files) as any[])
      .filter((f) => !f.dir)
      .map((f) => ({ name: String(f.name).split("/").pop()!, bytes: f.asUint8Array() as Uint8Array }));
  }

  /** Einheiten am Dateianfang ("0005-0006_Name.pdf") */
  const einheitenAusName = (n: string) => n.match(/^(\d+(?:-\d+)*)_/)?.[1]?.split("-") ?? [];

  /** Kontakte (Eigentümer) zu Einheiten eines Objekts */
  async function eigentuemerKontakte(building_id: string, einheiten: string[]): Promise<string[]> {
    if (!einheiten.length) return [];
    const { data } = await db.from("contact_building_assignments")
      .select("contact_id, unit_number, role_in_building, is_active")
      .eq("building_id", building_id).eq("role_in_building", "eigentuemer");
    const s = new Set(einheiten.map((u) => einheitKey(u)));
    return [...new Set((data ?? []).filter((a: any) => a.is_active !== false && s.has(einheitKey(a.unit_number))).map((a: any) => a.contact_id))] as string[];
  }

  async function kategorieId(building_id: string, slug: string): Promise<string | null> {
    await db.rpc("ensure_stammakte_categories", { p_building_id: building_id }).then(() => {}, () => {});
    const { data } = await db.from("building_file_categories").select("id").eq("building_id", building_id).eq("slug", slug).maybeSingle();
    if (data?.id) return data.id;
    const oben = slug.split("-")[0];
    const { data: o } = await db.from("building_file_categories").select("id").eq("building_id", building_id).eq("slug", oben).maybeSingle();
    return o?.id ?? null;
  }

  async function rgiGebaeude(): Promise<string | null> {
    const { data } = await db.from("building_file_categories").select("building_id").eq("slug", "rgi-angebote").limit(1).maybeSingle();
    return data?.building_id ?? null;
  }

  const sicher = (n: string) => n.replace(/[^\w.\-äöüÄÖÜß§ ]+/g, "_").replace(/\s+/g, "_");
  /** Speicher-Schlüssel nur mit erlaubten Zeichen (§, Umlaute u. a. lehnt der Speicher ab) */
  const schluessel = (n: string) =>
    n.replace(/§/g, "Par").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
      .normalize("NFKD").replace(/[^\w.\-]+/g, "_");

  /** Ergebnis verteilen: Chat-Link, Mail-Anhang, DMS, Rundmail */
  async function ausliefern(art: string, dateien: Datei[], a: any, kontext: { building_id: string | null; wirtschaftsjahr?: number | null; kategorie?: string }) {
    const lauf = crypto.randomUUID();
    const ergebnis: any[] = [];
    let gesamt = 0;
    for (const f of dateien) {
      const name = sicher(f.name);
      const mime = f.mime ?? d.mimeVon(name);
      // Ablage für Chat-Download und als Mail-Anhang (gleicher Speicherort wie mail_anhang_vorbereiten)
      const path = `outgoing/claude/${lauf}/${schluessel(name)}`;
      const { error } = await db.storage.from("email-attachments").upload(path, f.bytes, { contentType: mime, upsert: true });
      if (error) throw new Error(`${name}: ${error.message}`);
      const { data: s } = await db.storage.from("email-attachments").createSignedUrl(path, 24 * 3600);
      gesamt += f.bytes.byteLength;
      ergebnis.push({ dateiname: name, groesse_kb: Math.round(f.bytes.byteLength / 1024), einheiten: f.einheiten ?? undefined, download_url: s?.signedUrl ?? null, anhang: { storage_path: path, dateiname: name, mime_type: mime } });
    }

    // Alle zusammen als ZIP zum Ansehen
    let zip_download_url: string | null = null;
    if (dateien.length > 1) {
      const z = new PizZip();
      dateien.forEach((f, i) => z.file(ergebnis[i].dateiname, f.bytes));
      const zp = `outgoing/claude/${lauf}/${schluessel(ARTEN[art]?.titel ?? art).slice(0, 60)}.zip`;
      await db.storage.from("email-attachments").upload(zp, z.generate({ type: "uint8array" }), { contentType: "application/zip", upsert: true });
      const { data: s } = await db.storage.from("email-attachments").createSignedUrl(zp, 24 * 3600);
      zip_download_url = s?.signedUrl ?? null;
    }

    // DMS
    const dms: any[] = [];
    if (a.ins_dms) {
      const building_id = a.dms_building_id ?? kontext.building_id ?? (await rgiGebaeude());
      if (!building_id) throw new Error("Für die DMS-Ablage fehlt das Objekt (building_id)");
      const katCache = new Map<string, string | null>();
      const katFuer = async (slug: string) => {
        if (!katCache.has(slug)) katCache.set(slug, await kategorieId(building_id, slug));
        return katCache.get(slug)!;
      };
      for (const [i, f] of dateien.entries()) {
        const kat = a.dms_kategorie_id ?? (await katFuer(f.kategorie ?? kontext.kategorie ?? ARTEN[art]?.kategorie ?? "sonstiges"));
        const name = ergebnis[i].dateiname;
        const p = `claude/${building_id}/${lauf}/${schluessel(name)}`;
        const { error } = await db.storage.from("building-files").upload(p, f.bytes, { contentType: ergebnis[i].anhang.mime_type, upsert: true });
        if (error) throw new Error(`DMS-Upload ${name}: ${error.message}`);
        let kontakte = f.kontakt_ids ?? [];
        if (a.portal_freigeben && !kontakte.length && f.einheiten?.length) kontakte = await eigentuemerKontakte(building_id, f.einheiten);
        // Persönliche Dokumente nur für den Eigentümer, Gesamtdokumente für alle Eigentümer des Objekts
        const persoenlich = kontakte.length > 0 || !!f.einheiten?.length;
        const freigeben = !!a.portal_freigeben && (kontakte.length > 0 || !persoenlich);
        const r = await d.dmsEintragAnlegen({
          building_id, path: p, anzeigename: name, kategorie_id: kat ?? undefined, mime_type: ergebnis[i].anhang.mime_type,
          wirtschaftsjahr: kontext.wirtschaftsjahr ?? a.wirtschaftsjahr ?? undefined,
          sichtbarkeit: !freigeben ? "intern" : persoenlich ? "personen" : "eigentuemer", kontakt_ids: freigeben && persoenlich ? kontakte : undefined,
          benachrichtigen: freigeben && a.benachrichtigen === true,
          beschreibung: `${ARTEN[art]?.titel ?? art} – erstellt über Claude`, tags: [art],
          mitarbeiter_email: a.mitarbeiter_email, source: "manual", texterkennung: false,
        });
        dms.push({ dateiname: name, file_id: r.file_id, sichtbarkeit: r.sichtbarkeit });
      }
    }

    // Rundmail: je Eigentümer persönlicher Anhang (Einheit am Dateianfang), sonst für alle
    let rundmail: any = null;
    if (a.rundmail_id) {
      const camp = await rundmailEntwurfLaden(db, a.rundmail_id);
      if (kontext.building_id && camp.building_id !== kontext.building_id) throw new Error("Rundmail gehört zu einem anderen Objekt");
      const ts = Date.now();
      const pfade: { path: string; art?: "persoenlich" | "alle"; einheiten?: string[] }[] = [];
      for (const [i, f] of dateien.entries()) {
        const persoenlich = !!f.einheiten?.length;
        const p = `campaigns/${a.rundmail_id}/${persoenlich ? "personal" : "attachments"}/${ts}_${schluessel(ergebnis[i].dateiname)}`;
        const { error } = await db.storage.from("comm-assets").upload(p, f.bytes, { contentType: ergebnis[i].anhang.mime_type, upsert: true });
        if (error) throw new Error(`Rundmail-Anhang ${ergebnis[i].dateiname}: ${error.message}`);
        pfade.push(persoenlich ? { path: p, art: "persoenlich", einheiten: f.einheiten } : { path: p, art: "alle" });
      }
      rundmail = await rundmailAnhaengeZuordnen(db, a.rundmail_id, pfade);
    }

    return {
      art: ARTEN[art]?.titel ?? art,
      anzahl: dateien.length,
      gesamt_kb: Math.round(gesamt / 1024),
      zip_download_url,
      dateien: ergebnis,
      dms: dms.length ? dms : undefined,
      rundmail: rundmail ?? undefined,
      hinweise: [
        "download_url gilt 24 Stunden.",
        "Für eine E-Mail: die Objekte aus dateien[].anhang an mail_entwurf_anlegen bzw. mail_senden (anhaenge) übergeben.",
        ...(dms.length ? ["Im DMS abgelegt" + (a.portal_freigeben ? " und für die jeweiligen Eigentümer im Portal freigegeben." : " (intern, nicht im Portal sichtbar).")] : []),
      ],
    };
  }

  /** Nachfrage ab GRENZE Dokumenten */
  function grenzePruefen(anzahl: number, a: any) {
    if (anzahl >= GRENZE && !a.bestaetigt) {
      return {
        status: "BESTÄTIGUNG NÖTIG – noch nichts erzeugt",
        anzahl,
        hinweis: `Es würden ${anzahl} Dokumente erzeugt (PDF-Umwandlung kostet je Datei). Bitte den Nutzer fragen und dann mit bestaetigt=true erneut aufrufen.`,
      };
    }
    return null;
  }

  // ------------------------------------------------------------ Erzeuger je Art
  async function vorlagenbriefe(a: any, art: "vorlagenbrief" | "etv_einladung") {
    let building_id: string = a.building_id;
    let vorlage: any = null;
    if (art === "etv_einladung") {
      if (!a.meeting_id) throw new Error("meeting_id fehlt");
      const { data: m } = await db.from("etv_meetings").select("building_id").eq("id", a.meeting_id).maybeSingle();
      if (!m) throw new Error("Versammlung nicht gefunden");
      building_id = m.building_id;
      const { data: vs } = await db.from("comm_templates").select("id, name, building_id, docx_path, is_global, created_at")
        .eq("type", "letter").eq("template_kind", "etv_invitation")
        .or(`building_id.eq.${building_id},is_global.eq.true`).order("created_at", { ascending: false });
      vorlage = a.vorlage_id ? (vs ?? []).find((t: any) => t.id === a.vorlage_id) : ((vs ?? []).find((t: any) => t.building_id === building_id) ?? (vs ?? [])[0]);
      if (!vorlage) throw new Error("Keine Einladungsvorlage gefunden");
    } else {
      if (!building_id || !a.vorlage_id) throw new Error("building_id und vorlage_id angeben");
      const { data: t } = await db.from("comm_templates").select("id, name, building_id, docx_path, is_global").eq("id", a.vorlage_id).maybeSingle();
      if (!t) throw new Error("Vorlage nicht gefunden");
      if (!t.docx_path) throw new Error("Diese Vorlage hat keine Word-Datei");
      vorlage = t;
    }
    const filter: Record<string, unknown> = {
      roles: a.empfaenger_rolle && a.empfaenger_rolle !== "alle" ? [a.empfaenger_rolle] : art === "etv_einladung" ? ["eigentuemer"] : ["eigentuemer"],
      contact_ids: [],
      assignment_ids: a.assignment_ids ?? [],
      group_by_contact: true,
    };
    if (a.einheiten?.length) filter.unit_numbers = a.einheiten;
    const freie = (a.freie_felder ?? {}) as Record<string, string>;

    const empf = await loadRecipients(db, building_id, filter as any, freie);
    if (!empf.length) throw new Error("Keine Empfänger gefunden");
    const halt = grenzePruefen(empf.length, a);
    if (halt) return halt;

    const { data: brief, error } = await db.from("comm_campaigns").insert({
      name: `${art === "etv_einladung" ? "Einladung ETV" : "Brief"}: ${vorlage.name} (Claude)`,
      type: "letter", template_id: vorlage.id, building_id, recipient_filter: filter, free_vars: freie,
      status: "draft", created_by: await d.uploaderId(a.mitarbeiter_email),
    }).select("id").single();
    if (error || !brief) throw new Error(`Serienbrief konnte nicht angelegt werden: ${error?.message ?? ""}`);
    const r = await funktion("comm-render-letters", { campaign_id: brief.id, output_format: a.format === "docx" ? "docx" : "pdf", meeting_id: a.meeting_id ?? null, dms_ablegen: false });
    const dateien: Datei[] = zipAuspacken(await laden("comm-assets", r.zip_path)).map((f) => {
      const einh = einheitenAusName(f.name);
      return { name: art === "etv_einladung" && einh.length ? `${einh.join("-")}_Einladung_${f.name.slice(einh.join("-").length + 1)}` : f.name, bytes: f.bytes, einheiten: einh.length ? einh : undefined };
    });
    const aus = await ausliefern(art, dateien, a, { building_id, kategorie: ARTEN[art].kategorie });
    return { vorlage: vorlage.name, empfaenger: r.recipient_count, fehlgeschlagen: r.failed, ...aus };
  }

  async function protokoll(a: any) {
    if (!a.meeting_id) throw new Error("meeting_id fehlt");
    const { data: m } = await db.from("etv_meetings").select("building_id, title").eq("id", a.meeting_id).maybeSingle();
    if (!m) throw new Error("Versammlung nicht gefunden");
    // Die App legt das Protokoll selbst ins DMS (Kategorie Protokolle) – das übernehmen wir, wenn gewünscht
    const r = await funktion("etv-render-protocol", { meeting_id: a.meeting_id, output_format: a.format === "docx" ? "docx" : "pdf", file_to_dms: !!a.ins_dms });
    const name = (r.storage_path as string).split("/").pop()!.replace(/_\d{13}(\.\w+)$/, "$1");
    const aus = await ausliefern("protokoll", [{ name, bytes: await laden("building-files", r.storage_path) }], { ...a, ins_dms: false }, { building_id: m.building_id });
    return { ...aus, dms: r.dms_file_id ? [{ dateiname: name, file_id: r.dms_file_id, sichtbarkeit: "intern" }] : undefined };
  }

  async function bericht(a: any) {
    if (!a.agenda_item_id) throw new Error("agenda_item_id fehlt");
    const { data: top } = await db.from("etv_agenda_items").select("meeting_id, etv_meetings(building_id)").eq("id", a.agenda_item_id).maybeSingle();
    if (!top) throw new Error("TOP nicht gefunden");
    const r = await funktion("etv-render-report", { agenda_item_id: a.agenda_item_id, output_format: a.format === "docx" ? "docx" : "pdf" });
    return await ausliefern("versammlungsbericht", [{ name: r.file_name, bytes: await laden("building-files", r.storage_path) }], a, { building_id: (top as any).etv_meetings?.building_id ?? null });
  }

  async function angebot(a: any) {
    if (!a.offer_id) throw new Error("offer_id fehlt");
    const r = await funktion("rgi-render-offer", { offer_id: a.offer_id, formats: [a.format === "docx" ? "docx" : "pdf"] });
    const pfade = [a.format === "docx" ? r.docx_path : r.pdf_path, a.format === "docx" ? r.summary_docx_path : r.summary_pdf_path].filter(Boolean) as string[];
    if (!pfade.length) throw new Error(r.pdf_error ?? "Angebot wurde ohne Datei erzeugt");
    const dateien: Datei[] = [];
    for (const p of pfade) dateien.push({ name: p.split("/").pop()!, bytes: await laden("invoices", p) });
    // Die App legt Angebote selbst im DMS ab (Ordner des Angebots)
    return { ...(await ausliefern("angebot", dateien, { ...a, ins_dms: false }, { building_id: null })), dms_hinweis: r.dms_error ? `DMS: ${r.dms_error}` : "Angebot liegt wie in der App im DMS (RGI › Angebote)." };
  }

  async function rgiRechnung(a: any) {
    if (!a.invoice_id) throw new Error("invoice_id fehlt");
    const { data: inv } = await db.from("rgi_invoices").select("id, invoice_number, pdf_storage_path").eq("id", a.invoice_id).maybeSingle();
    if (!inv) throw new Error("Rechnung nicht gefunden");
    let pfad = inv.pdf_storage_path as string | null;
    if (!pfad) pfad = (await funktion("rgi-render-invoice", { invoice_id: a.invoice_id })).pdf_path;
    if (!pfad) throw new Error("Rechnung hat kein PDF");
    return await ausliefern("rgi_rechnung", [{ name: pfad.split("/").pop()!, bytes: await laden("invoices", pfad) }], a, { building_id: null });
  }

  /** Abrechnung, Wirtschaftsplan, §35a: Berechnung und Erzeugung serverseitig (finanz-dokumente) */
  async function finanzDokumente(a: any, art: "jahresabrechnung" | "wirtschaftsplan" | "bescheinigung_35a") {
    if (!a.building_id || !a.wirtschaftsjahr) throw new Error("building_id und wirtschaftsjahr angeben");
    const vorschau = await funktion("finanz-dokumente", { art, building_id: a.building_id, wirtschaftsjahr: a.wirtschaftsjahr, einheiten: a.einheiten ?? null, nur_gesamt: !!a.nur_gesamt, nur_zaehlen: true, vorlage_id: a.vorlage_id ?? null });
    const halt = grenzePruefen(vorschau.anzahl ?? 0, a);
    if (halt) return { ...halt, warnungen: vorschau.warnungen };
    const r = await funktion("finanz-dokumente", { art, building_id: a.building_id, wirtschaftsjahr: a.wirtschaftsjahr, einheiten: a.einheiten ?? null, nur_gesamt: !!a.nur_gesamt, format: a.format === "docx" ? "docx" : "pdf", vorlage_id: a.vorlage_id ?? null });
    const dateien: Datei[] = [];
    for (const f of r.dateien ?? []) {
      dateien.push({ name: f.dateiname, bytes: await laden(f.bucket, f.path), einheiten: f.einheiten ?? undefined, kontakt_ids: f.kontakt_ids ?? undefined, kategorie: f.kategorie ?? undefined });
    }
    const aus = await ausliefern(art, dateien, a, { building_id: a.building_id, wirtschaftsjahr: a.wirtschaftsjahr });
    // Gesamtdokumente in den passenden Ordner
    return { ...aus, berechnung: r.zusammenfassung, warnungen: r.warnungen?.length ? r.warnungen : undefined };
  }

  // ------------------------------------------------------------ Werkzeuge
  const ziele = {
    ins_dms: { type: "boolean", description: "im DMS des Objekts ablegen (Standard: nein). Ohne portal_freigeben nur intern sichtbar." },
    portal_freigeben: { type: "boolean", description: "im DMS je Dokument nur für den betroffenen Eigentümer im Portal freigeben (Standard: nein)" },
    benachrichtigen: { type: "boolean", description: "bei portal_freigeben die Eigentümer per E-Mail benachrichtigen (Standard: nein)" },
    rundmail_id: uuid("optional: Rundmail-Entwurf, an den die Dokumente gehängt werden (je Eigentümer persönlich über die Einheitennummer)"),
    format: { type: "string", enum: ["pdf", "docx"], description: "Standard: pdf" },
    bestaetigt: { type: "boolean", description: `ab ${GRENZE} Dokumenten nötig – erst nach Zustimmung des Nutzers true setzen` },
    mitarbeiter_email: str("optional: wer das veranlasst"),
  };

  return [
    {
      name: "dokument_arten",
      description: "Zeigt, welche Dokumente über den Konnektor erstellt werden können und welche Angaben dafür nötig sind. Vor dokument_erstellen aufrufen, wenn unklar ist, welche Art passt.",
      inputSchema: S({}),
      annotations: { readOnlyHint: true },
      run: async () => ({
        arten: Object.entries(ARTEN).map(([k, v]) => ({ art: k, ...v })),
        ziele: "Ergebnis immer als Download-Link im Chat; zusätzlich ins_dms, rundmail_id oder als Mail-Anhang (dateien[].anhang an mail_entwurf_anlegen).",
        grenze: `Ab ${GRENZE} Dokumenten erst nachfragen (bestaetigt=true).`,
      }),
    },
    {
      name: "dokument_vorlagen",
      description: "Listet die Word-Vorlagen für Briefe (allgemein und objektbezogen) mit vorlage_id und den Platzhaltern für freie Felder. Für dokument_erstellen mit art=vorlagenbrief bzw. etv_einladung.",
      inputSchema: S({ building_id: uuid("optional: nur Vorlagen, die für dieses Objekt gelten") }),
      annotations: { readOnlyHint: true },
      run: async (a) => {
        let q = db.from("comm_templates").select("id, name, template_kind, building_id, is_global, docx_path, variables, created_at").eq("type", "letter").order("created_at", { ascending: false });
        if (a.building_id) q = q.or(`building_id.eq.${a.building_id},is_global.eq.true,building_id.is.null`);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).filter((t: any) => t.docx_path).map((t: any) => ({ vorlage_id: t.id, name: t.name, art: t.template_kind === "etv_invitation" ? "etv_einladung" : "vorlagenbrief", objektbezogen: !!t.building_id, platzhalter: t.variables ?? undefined }));
      },
    },
    {
      name: "dokument_erstellen",
      description:
        `Erstellt Dokumente mit den Vorlagen und Berechnungen der App (Arten siehe dokument_arten): Briefe aus Vorlagen, ETV-Einladungen, Protokolle, TOP-Berichte, Angebote, RGI-Rechnungen, Jahresabrechnungen, Wirtschaftspläne, §35a-Bescheinigungen. Ergebnis: Download-Links (24 Std.) und Anhang-Objekte für E-Mails; optional DMS-Ablage und/oder Anhang an eine Rundmail. Es wird nichts versendet. Ab ${GRENZE} Dokumenten zuerst ohne bestaetigt aufrufen und den Nutzer fragen.`,
      inputSchema: S({
        art: { type: "string", enum: Object.keys(ARTEN) },
        building_id: uuid("Objekt (für vorlagenbrief, jahresabrechnung, wirtschaftsplan, bescheinigung_35a)"),
        wirtschaftsjahr: { type: "integer", description: "für jahresabrechnung, wirtschaftsplan, bescheinigung_35a" },
        meeting_id: uuid("Versammlung (etv_einladung, protokoll; optional bei vorlagenbrief für Versammlungs-Platzhalter)"),
        agenda_item_id: uuid("TOP (versammlungsbericht)"),
        offer_id: uuid("Angebot (angebot)"),
        invoice_id: uuid("RGI-Rechnung (rgi_rechnung)"),
        vorlage_id: uuid("Vorlage (vorlagenbrief Pflicht; sonst optional)"),
        empfaenger_rolle: { type: "string", enum: ["eigentuemer", "mieter", "alle"], description: "vorlagenbrief: Empfänger (Standard: eigentuemer)" },
        assignment_ids: { type: "array", items: { type: "string", format: "uuid" }, description: "nur diese Zuordnungen (Einheit/Person)" },
        einheiten: { type: "array", items: { type: "string" }, description: "nur diese Einheiten, z. B. [\"0003\",\"0007\"]" },
        freie_felder: { type: "object", additionalProperties: { type: "string" }, description: "vorlagenbrief: Werte für freie Platzhalter, z. B. {\"betreff\":\"…\",\"brieftext\":\"…\"}" },
        nur_gesamt: { type: "boolean", description: "jahresabrechnung/wirtschaftsplan: nur das Gesamtdokument" },
        ...ziele,
      }, ["art"]),
      run: async (a) => {
        const t0 = Date.now();
        let r: any;
        switch (a.art) {
          case "vorlagenbrief": r = await vorlagenbriefe(a, "vorlagenbrief"); break;
          case "etv_einladung": r = await vorlagenbriefe(a, "etv_einladung"); break;
          case "protokoll": r = await protokoll(a); break;
          case "versammlungsbericht": r = await bericht(a); break;
          case "angebot": r = await angebot(a); break;
          case "rgi_rechnung": r = await rgiRechnung(a); break;
          case "jahresabrechnung":
          case "wirtschaftsplan":
          case "bescheinigung_35a": r = await finanzDokumente(a, a.art); break;
          default: throw new Error(`Unbekannte Art: ${a.art}`);
        }
        await log("dokument_erstellen", { art: a.art, building_id: a.building_id ?? null, anzahl: r?.anzahl ?? null, ins_dms: !!a.ins_dms, rundmail_id: a.rundmail_id ?? null, status: r?.status ?? "ok", sekunden: Math.round((Date.now() - t0) / 1000), mitarbeiter: a.mitarbeiter_email ?? null });
        return r;
      },
    },
  ];
}
