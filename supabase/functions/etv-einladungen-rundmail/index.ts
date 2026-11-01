// ETV-Einladungen erzeugen und je Eigentümer als persönlichen Anhang an eine Rundmail (Entwurf) hängen.
// Ablauf wie in der App: Einladungsvorlage des Objekts (sonst die allgemeine) -> comm-render-letters (PDF)
// -> ZIP auspacken -> je Datei "<Einheiten>_Einladung_Eigentuemerversammlung_<Datum>.pdf" in die Rundmail
// legen -> über die Einheitennummer den Empfängern zuordnen. Versendet wird weiterhin in der App.
// Aufruf: Büro-Mitarbeiter, Service-Schlüssel (Claude-Konnektor) oder Zeitplan-Schlüssel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import { requireStaffOrCron } from "../_shared/require-cron.ts";
import {
  rundmailAnhaengeZuordnen,
  rundmailEntwurfLaden,
  rundmailPersoenlicheAnhaengeEntfernen,
} from "../_shared/rundmail-anhaenge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const DEFAULT_USER = "ef8c8c83-1f8f-426d-a7d6-a7d1fe26156e";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function datumBerlin(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" })
      .formatToParts(new Date(iso)).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]),
  );
  return `${p.day}.${p.month}.${p.year}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await requireStaffOrCron(req, corsHeaders);
  if (!auth.ok) return auth.response;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const meeting_id: string | undefined = body?.meeting_id;
    const rundmail_id: string | undefined = body?.rundmail_id;
    const ersetzen = body?.ersetzen !== false;
    if (!meeting_id || !rundmail_id) return json({ error: "meeting_id und rundmail_id erforderlich" }, 400);

    const { data: m } = await db.from("etv_meetings").select("id, building_id, title, meeting_date").eq("id", meeting_id).maybeSingle();
    if (!m) return json({ error: "Versammlung nicht gefunden" }, 404);
    const rundmail = await rundmailEntwurfLaden(db, rundmail_id);
    if (rundmail.building_id !== m.building_id) return json({ error: "Rundmail und Versammlung gehören zu verschiedenen Objekten" }, 400);

    // Vorlage wie in der App: objektbezogene Vorlage vor der allgemeinen, jeweils die neueste
    const { data: vorlagen } = await db.from("comm_templates")
      .select("id, name, building_id, created_at")
      .eq("type", "letter").eq("template_kind", "etv_invitation")
      .or(`building_id.eq.${m.building_id},is_global.eq.true`)
      .order("created_at", { ascending: false });
    const liste = vorlagen ?? [];
    const vorlage = body?.vorlage_id
      ? liste.find((t: any) => t.id === body.vorlage_id)
      : (liste.find((t: any) => t.building_id === m.building_id) ?? liste[0]);
    if (!vorlage) return json({ error: "Keine Einladungsvorlage gefunden" }, 400);

    const createdBy = auth.userId && !["cron", "service"].includes(auth.userId) ? auth.userId : (body?.created_by ?? DEFAULT_USER);
    const { data: brief, error: bErr } = await db.from("comm_campaigns").insert({
      name: `Einladung ETV: ${vorlage.name}`,
      type: "letter",
      template_id: vorlage.id,
      building_id: m.building_id,
      recipient_filter: { roles: ["eigentuemer"], contact_ids: [], assignment_ids: [], group_by_contact: true },
      status: "draft",
      created_by: createdBy,
    }).select("id").single();
    if (bErr || !brief) throw new Error(`Serienbrief konnte nicht angelegt werden: ${bErr?.message ?? "unbekannt"}`);

    // Einladungen als PDF erzeugen (gleiche Funktion wie in der App)
    const res = await fetch(`${SUPABASE_URL}/functions/v1/comm-render-letters`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: brief.id, output_format: "pdf", meeting_id }),
    });
    const r: any = await res.json().catch(() => ({}));
    if (!res.ok || r?.error || !r?.zip_path) throw new Error(`Einladungen konnten nicht erzeugt werden: ${r?.error ?? res.status}`);

    const { data: zipBlob, error: zErr } = await db.storage.from("comm-assets").download(r.zip_path);
    if (zErr || !zipBlob) throw new Error("ZIP mit den Einladungen konnte nicht geladen werden");
    const zip = new PizZip(new Uint8Array(await zipBlob.arrayBuffer()));
    const datum = m.meeting_date ? datumBerlin(m.meeting_date) : "";
    const ts = Date.now();
    const neuePfade: { path: string }[] = [];
    const ohneEinheit: string[] = [];
    for (const f of Object.values(zip.files) as any[]) {
      if (f.dir || !String(f.name).toLowerCase().endsWith(".pdf")) continue;
      const einheiten = String(f.name).split("/").pop()!.match(/^(\d+(?:-\d+)*)_/)?.[1];
      if (!einheiten) { ohneEinheit.push(f.name); continue; }
      const name = `${einheiten}_Einladung_Eigentuemerversammlung${datum ? `_${datum}` : ""}.pdf`;
      const path = `campaigns/${rundmail_id}/personal/${ts}_${name}`;
      const { error } = await db.storage.from("comm-assets").upload(path, f.asUint8Array(), { contentType: "application/pdf", upsert: true });
      if (error) throw new Error(`${name}: ${error.message}`);
      neuePfade.push({ path });
    }
    if (!neuePfade.length) throw new Error("Im ZIP wurden keine Einladungen gefunden");

    // Ältere Einladungen erst entfernen, wenn die neuen sicher abgelegt sind
    const entfernt = ersetzen ? await rundmailPersoenlicheAnhaengeEntfernen(db, rundmail_id, /einladung/i) : [];
    const zuordnung = await rundmailAnhaengeZuordnen(db, rundmail_id, neuePfade);
    const { data: signed } = await db.storage.from("comm-assets").createSignedUrl(r.zip_path, 3600);

    return json({
      ok: true,
      versammlung: m.title,
      datum,
      vorlage: vorlage.name,
      serienbrief_id: brief.id,
      einladungen_erzeugt: r.ok,
      einladungen_fehlgeschlagen: r.failed,
      zip_download_url: signed?.signedUrl ?? null,
      alte_einladungen_entfernt: entfernt.length,
      ohne_einheitennummer: ohneEinheit,
      ...zuordnung,
    });
  } catch (e) {
    console.error("etv-einladungen-rundmail", e);
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
