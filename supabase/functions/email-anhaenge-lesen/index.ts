// Liest den Text aus E-Mail-Anhängen (PDF, Bilder per OCR; Word und Text direkt)
// und speichert ihn in email_attachments.extracted_text – so lassen sich
// Anhänge später durchsuchen und von Claude lesen, ohne die Datei zu öffnen.
// Läuft alle 5 Minuten per Zeitplan; einzelne Mail: { email_id }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import { requireStaffOrCron } from "../_shared/require-cron.ts";
import { ocrMitCache, seitenAlsText, sha256Hex } from "../_shared/ocr-cache.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const MISTRAL = Deno.env.get("MISTRAL_API_KEY") ?? "";
const BUCKET = "email-attachments";
const JE_LAUF = 8;
const MAX_BYTES = 25 * 1024 * 1024;
// Kleine Bilder sind fast immer Logos/Signaturen – nicht per OCR lesen (kostet Geld)
const MIN_BILD_BYTES = 40 * 1024;
// Zeitplan liest nur neue Anhänge (kein Altbestand – OCR kostet je Seite)
const NUR_NEUER_ALS_STUNDEN = 48;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function art(name: string, mime: string | null): "ocr" | "docx" | "text" | null {
  const n = name.toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf" || n.endsWith(".pdf")) return "ocr";
  if (/^image\/(jpeg|png|webp)$/.test(m) || /\.(jpe?g|png|webp)$/.test(n)) return "ocr";
  if (n.endsWith(".docx") || m.includes("wordprocessingml")) return "docx";
  if (/\.(txt|csv|md|html?|xml|json|eml)$/.test(n) || m.startsWith("text/")) return "text";
  return null;
}

function docxText(buf: Uint8Array): string {
  const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function lesen(db: any, a: any): Promise<{ text: string | null; status: string; sha?: string | null }> {
  const typ = art(a.file_name ?? "", a.mime_type);
  if (!typ) return { text: null, status: "nicht_lesbar" };
  if (a.file_size && a.file_size > MAX_BYTES) return { text: null, status: "zu_gross" };
  if (typ === "ocr") {
    if (!MISTRAL) throw new Error("MISTRAL_API_KEY fehlt");
    const istBild = !/pdf/i.test(a.mime_type ?? "") && !/\.pdf$/i.test(a.file_name ?? "");
    if (istBild && (a.file_size ?? 0) < MIN_BILD_BYTES) return { text: null, status: "nicht_lesbar" };
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(a.file_path, 900);
    if (error || !data?.signedUrl) throw new Error(error?.message ?? "Kein Link");
    const r = await ocrMitCache(db, { url: data.signedUrl, bild: istBild, mime: a.mime_type ?? undefined, quelle: "mail", apiKey: MISTRAL });
    return { text: seitenAlsText(r.seiten, false), status: "ok", sha: r.sha };
  }
  const { data, error } = await db.storage.from(BUCKET).download(a.file_path);
  if (error || !data) throw new Error(error?.message ?? "Download fehlgeschlagen");
  if (typ === "docx") return { text: docxText(new Uint8Array(await data.arrayBuffer())), status: "ok" };
  return { text: (await data.text()).slice(0, 500_000), status: "ok" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...cors, "Access-Control-Allow-Headers": req.headers.get("access-control-request-headers") ?? cors["Access-Control-Allow-Headers"], "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  }
  const auth = await requireStaffOrCron(req, cors);
  if (!auth.ok) return auth.response;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  if (body?.altbestand) return json(await altbestandUebernehmen(db, Number(body.anzahl) || 40));

  let q = db
    .from("email_attachments")
    .select("id, email_id, file_name, file_path, file_size, mime_type")
    .is("text_status", null)
    .or("is_inline.is.null,is_inline.eq.false")
    .order("created_at", { ascending: false })
    .limit(body?.email_id ? 50 : JE_LAUF);
  if (body?.email_id) q = q.eq("email_id", body.email_id);
  else q = q.gte("created_at", new Date(Date.now() - NUR_NEUER_ALS_STUNDEN * 3600000).toISOString());
  const { data: liste, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const ergebnis: any[] = [];
  for (const a of liste ?? []) {
    try {
      const r = await lesen(db, a);
      await db.from("email_attachments").update({ extracted_text: r.text, text_status: r.status, sha256: r.sha ?? null, text_extrahiert_am: new Date().toISOString() }).eq("id", a.id);
      ergebnis.push({ id: a.id, name: a.file_name, status: r.status, zeichen: r.text?.length ?? 0 });
    } catch (e: any) {
      console.error("Anhang", a.id, e?.message);
      await db.from("email_attachments").update({ text_status: "fehler", text_fehler: String(e?.message ?? e).slice(0, 500), text_extrahiert_am: new Date().toISOString() }).eq("id", a.id);
      ergebnis.push({ id: a.id, name: a.file_name, status: "fehler", fehler: e?.message });
    }
  }
  return json({ ok: true, gelesen: ergebnis.length, ergebnis });
});

/**
 * Schon gelesene Anhänge in den gemeinsamen Textspeicher übernehmen: Datei
 * einmal laden, Fingerabdruck bilden, vorhandenen Text speichern – ohne OCR.
 */
async function altbestandUebernehmen(db: any, anzahl: number) {
  const { data: liste } = await db
    .from("email_attachments")
    .select("id, file_name, file_path, mime_type, extracted_text")
    .eq("text_status", "ok")
    .is("sha256", null)
    .not("extracted_text", "is", null)
    .limit(anzahl);
  let ok = 0, fehler = 0;
  for (const a of liste ?? []) {
    try {
      if (art(a.file_name ?? "", a.mime_type) !== "ocr") {
        await db.from("email_attachments").update({ sha256: "-" }).eq("id", a.id);
        continue;
      }
      const { data, error } = await db.storage.from(BUCKET).download(a.file_path);
      if (error || !data) throw new Error(error?.message ?? "Download");
      const sha = await sha256Hex(new Uint8Array(await data.arrayBuffer()));
      const text = String(a.extracted_text);
      const seiten = /^--- Seite 1 ---/.test(text) ? text.split(/\n*--- Seite \d+ ---\n/).slice(1) : [text];
      await db.from("ocr_cache").upsert({ sha256: sha, seiten, seitenzahl: seiten.length, quelle: "mail-altbestand" }, { onConflict: "sha256", ignoreDuplicates: true });
      await db.from("email_attachments").update({ sha256: sha }).eq("id", a.id);
      ok++;
    } catch (e) {
      console.error("altbestand", a.id, (e as any)?.message);
      await db.from("email_attachments").update({ sha256: "-" }).eq("id", a.id);
      fehler++;
    }
  }
  const { count } = await db.from("email_attachments").select("id", { count: "exact", head: true }).eq("text_status", "ok").is("sha256", null);
  return { ok: true, uebernommen: ok, fehler, rest: count ?? null };
}
