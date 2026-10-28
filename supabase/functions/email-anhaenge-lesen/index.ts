// Liest den Text aus E-Mail-Anhängen (PDF, Bilder per OCR; Word und Text direkt)
// und speichert ihn in email_attachments.extracted_text – so lassen sich
// Anhänge später durchsuchen und von Claude lesen, ohne die Datei zu öffnen.
// Läuft alle 5 Minuten per Zeitplan; einzelne Mail: { email_id }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import { requireStaffOrCron } from "../_shared/require-cron.ts";

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

async function ocr(url: string, bild: boolean): Promise<string> {
  const r = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: { Authorization: `Bearer ${MISTRAL}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: bild ? { type: "image_url", image_url: url } : { type: "document_url", document_url: url },
      include_image_base64: false,
    }),
  });
  if (!r.ok) throw new Error(`OCR ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  if (Array.isArray(d.pages)) return d.pages.map((p: any, i: number) => (d.pages.length > 1 ? `--- Seite ${i + 1} ---\n` : "") + (p.markdown ?? "")).join("\n\n").trim();
  return String(d.text ?? "").trim();
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

async function lesen(db: any, a: any): Promise<{ text: string | null; status: string }> {
  const typ = art(a.file_name ?? "", a.mime_type);
  if (!typ) return { text: null, status: "nicht_lesbar" };
  if (a.file_size && a.file_size > MAX_BYTES) return { text: null, status: "zu_gross" };
  if (typ === "ocr") {
    if (!MISTRAL) throw new Error("MISTRAL_API_KEY fehlt");
    const istBild = !/pdf/i.test(a.mime_type ?? "") && !/\.pdf$/i.test(a.file_name ?? "");
    if (istBild && (a.file_size ?? 0) < MIN_BILD_BYTES) return { text: null, status: "nicht_lesbar" };
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(a.file_path, 900);
    if (error || !data?.signedUrl) throw new Error(error?.message ?? "Kein Link");
    const bild = !/pdf/i.test(a.mime_type ?? "") && !/\.pdf$/i.test(a.file_name ?? "");
    return { text: await ocr(data.signedUrl, bild), status: "ok" };
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
      await db.from("email_attachments").update({ extracted_text: r.text, text_status: r.status, text_extrahiert_am: new Date().toISOString() }).eq("id", a.id);
      ergebnis.push({ id: a.id, name: a.file_name, status: r.status, zeichen: r.text?.length ?? 0 });
    } catch (e: any) {
      console.error("Anhang", a.id, e?.message);
      await db.from("email_attachments").update({ text_status: "fehler", text_fehler: String(e?.message ?? e).slice(0, 500), text_extrahiert_am: new Date().toISOString() }).eq("id", a.id);
      ergebnis.push({ id: a.id, name: a.file_name, status: "fehler", fehler: e?.message });
    }
  }
  return json({ ok: true, gelesen: ergebnis.length, ergebnis });
});
