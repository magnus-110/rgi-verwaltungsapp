import { requireAdmin } from "../_shared/require-admin.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { kurzInhalt, verwendungszweck } from "../_shared/zahlungsdaten.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Verwendungszweck nachträglich erzeugen: „Re. Nr. XXXX, Inhalt in 1–3 Wörtern".
 * Nutzt die Rechnungspositionen und die Beschreibung aus der Datenbank.
 */
serve(async (req) => {
  if (req.method !== "OPTIONS") {
    const __auth = await requireAdmin(req, corsHeaders);
    if (!__auth.ok) return __auth.response;
  }
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: inv } = await supabase
      .from("invoices")
      .select("invoice_number, description, vendor_name, line_items")
      .eq("id", invoice_id)
      .single();
    if (!inv) throw new Error("Rechnung nicht gefunden");

    const inhalt = await kurzInhalt(Deno.env.get("MISTRAL_API_KEY"), {
      beschreibung: inv.description,
      positionen: (Array.isArray(inv.line_items) ? inv.line_items : []).map((l: any) => l?.description).filter(Boolean),
      lieferant: inv.vendor_name,
    });
    const zweck = verwendungszweck(inv.invoice_number, inhalt);
    if (zweck) await supabase.from("invoices").update({ payment_purpose: zweck }).eq("id", invoice_id);

    return new Response(JSON.stringify({ purpose: zweck }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-payment-purpose error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
