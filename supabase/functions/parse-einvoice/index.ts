// E-Rechnung Parser endpoint. Parser-Logik liegt in _shared/einvoice.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import { detectAndParseEInvoice } from "../_shared/einvoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ───────── Standalone Edge Function Endpoint ─────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoiceId } = await req.json();
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId erforderlich" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, file_path, file_name")
      .eq("id", invoiceId)
      .single();

    if (!invoice?.file_path) {
      return new Response(JSON.stringify({ error: "Rechnung nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signed } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 300);
    if (!signed?.signedUrl) throw new Error("Datei nicht lesbar");

    const fileResp = await fetch(signed.signedUrl);
    const bytes = new Uint8Array(await fileResp.arrayBuffer());

    const parsed = await detectAndParseEInvoice(bytes, invoice.file_name);
    if (!parsed) {
      return new Response(JSON.stringify({ detected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ detected: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("parse-einvoice error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
