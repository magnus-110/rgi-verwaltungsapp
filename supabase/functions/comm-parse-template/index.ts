// Parse a .docx template and extract {{variable}} placeholders
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import PizZip from "https://esm.sh/pizzip@3.1.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { docx_path } = await req.json();
    if (!docx_path) return json({ error: "docx_path required" }, 400);

    const { data: file, error: dlErr } = await admin.storage.from("comm-assets").download(docx_path);
    if (dlErr || !file) return json({ error: dlErr?.message || "Download failed" }, 404);

    const buf = new Uint8Array(await file.arrayBuffer());
    const zip = new PizZip(buf);

    // Concatenate all w:t text from the main document XML and headers/footers
    const xmlFiles = Object.keys(zip.files).filter((n) =>
      n === "word/document.xml" || n.match(/^word\/(header|footer)\d*\.xml$/)
    );

    const variableSet = new Set<string>();
    const placeholderRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

    for (const name of xmlFiles) {
      const xml = zip.file(name)?.asText() ?? "";
      // Strip XML tags so split placeholders ({{var}} broken by runs) become contiguous
      const stripped = xml.replace(/<[^>]+>/g, "");
      let m: RegExpExecArray | null;
      while ((m = placeholderRegex.exec(stripped)) !== null) {
        variableSet.add(m[1]);
      }
    }

    return json({ variables: Array.from(variableSet).sort() });
  } catch (e: any) {
    console.error("comm-parse-template error", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
