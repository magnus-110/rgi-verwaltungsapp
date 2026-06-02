// rgi-parse-template-placeholders
// Lädt eine DOCX-Vorlage, extrahiert {tag} / {#loop}{/loop} und speichert
// das Schema in rgi_invoice_templates.placeholder_schema.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REQUIRED_TAGS = [
  "rechnung.nummer", "rechnung.datum", "kunde.name", "summe.brutto",
];

function extractPlaceholders(xml: string): { tags: string[]; loops: string[] } {
  // Strip XML tags so split-runs in Word still merge correctly enough
  const text = xml.replace(/<[^>]+>/g, "");
  const tags = new Set<string>();
  const loops = new Set<string>();
  const re = /\{([#/]?)([a-zA-Z0-9_.]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const prefix = m[1];
    const name = m[2];
    if (prefix === "#" || prefix === "/") loops.add(name);
    else tags.add(name);
  }
  return { tags: [...tags].sort(), loops: [...loops].sort() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { template_id } = await req.json();
    if (!template_id) {
      return new Response(JSON.stringify({ error: "template_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: tpl } = await admin.from("rgi_invoice_templates").select("*").eq("id", template_id).maybeSingle();
    if (!tpl) {
      return new Response(JSON.stringify({ error: "Template not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: file, error: dlErr } = await admin.storage.from("rgi-invoice-templates").download(tpl.storage_path);
    if (dlErr || !file) {
      return new Response(JSON.stringify({ error: dlErr?.message || "download failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    const zip = new PizZip(buf);
    const xmlFiles = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"];
    let allTags = new Set<string>();
    let allLoops = new Set<string>();
    for (const f of xmlFiles) {
      const entry = zip.file(f);
      if (entry) {
        const { tags, loops } = extractPlaceholders(entry.asText());
        tags.forEach((t) => allTags.add(t));
        loops.forEach((l) => allLoops.add(l));
      }
    }
    const tags = [...allTags].sort();
    const loops = [...allLoops].sort();
    const missing = REQUIRED_TAGS.filter((t) => !tags.includes(t));
    const schema = { tags, loops, missing, parsed_at: new Date().toISOString() };
    await admin.from("rgi_invoice_templates").update({ placeholder_schema: schema }).eq("id", template_id);
    return new Response(JSON.stringify({ ok: true, schema }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("rgi-parse-template-placeholders error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
