import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token, kind, id } = await req.json();
    if (!token || !kind || !id) {
      return json({ error: "Missing parameters" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate token -> audit
    const { data: audit, error: auditErr } = await supabase
      .from("cash_audits")
      .select("id, building_id, fiscal_year")
      .eq("access_token", token)
      .maybeSingle();
    if (auditErr || !audit) return json({ error: "Invalid token" }, 401);

    let bucket = "";
    let path = "";

    if (kind === "invoice") {
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, file_path, building_id, invoice_date")
        .eq("id", id)
        .maybeSingle();
      if (!inv || !inv.file_path) return json({ error: "Not found" }, 404);
      if (inv.building_id !== audit.building_id) return json({ error: "Forbidden" }, 403);
      const year = inv.invoice_date ? new Date(inv.invoice_date).getFullYear() : null;
      if (year !== audit.fiscal_year) return json({ error: "Forbidden" }, 403);
      bucket = "invoices";
      path = inv.file_path;
    } else if (kind === "statement_pdf") {
      const { data: stmt } = await supabase
        .from("cash_audit_statements")
        .select("id, file_path, cash_audit_id")
        .eq("id", id)
        .maybeSingle();
      if (!stmt) return json({ error: "Not found" }, 404);
      if (stmt.cash_audit_id !== audit.id) return json({ error: "Forbidden" }, 403);
      bucket = "building-documents";
      path = stmt.file_path;
    } else if (kind === "bank_statement") {
      const { data: bs } = await supabase
        .from("bank_statements")
        .select("id, file_path, building_id")
        .eq("id", id)
        .maybeSingle();
      if (!bs || !bs.file_path) return json({ error: "Not found" }, 404);
      if (bs.building_id !== audit.building_id) return json({ error: "Forbidden" }, 403);
      bucket = "building-documents";
      path = bs.file_path;
    } else {
      return json({ error: "Invalid kind" }, 400);
    }

    const { data: signed, error: sErr } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (sErr || !signed?.signedUrl) return json({ error: sErr?.message || "Sign failed" }, 500);

    // Inline-Anzeige von PDFs erzwingen, unabhängig vom Storage-Content-Type
    // (Dateien mit ".PDF"-Endung landen sonst als octet-stream und würden
    // im <iframe> heruntergeladen statt angezeigt).
    const isPdf = /\.pdf$/i.test(path);
    const finalUrl = isPdf
      ? `${signed.signedUrl}${signed.signedUrl.includes("?") ? "&" : "?"}response-content-type=application/pdf&response-content-disposition=inline`
      : signed.signedUrl;

    return json({ signedUrl: finalUrl });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
