import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { invoice_id, description, vendor_name, invoice_number } = await req.json();

    if (!invoice_id || !description) {
      return new Response(JSON.stringify({ error: "invoice_id and description required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY not configured");

    const prompt = `Du bist ein Assistent für Hausverwaltung. Erstelle aus der folgenden Rechnungsbeschreibung einen extrem kurzen Verwendungszweck für eine Banküberweisung. Maximal 4 Wörter, wenn möglich weniger. Nutze gängige Abkürzungen. Kein Satzzeichen am Ende. Nenne NICHT den Firmennamen, nur den Grund/die Leistung.

Beispiele:
- "Hausmeisterservice und Winterdienst Januar bis März 2025" → "Hausmeister + Winterdienst"
- "Gebäudereinigung Treppenhaus und Flure" → "Gebäudereinigung"
- "Reparatur Heizungsanlage Kesselraum" → "Heizungsreparatur"
- "Grundsteuer B 1. Quartal 2025" → "Grundsteuer Q1/25"
- "Versicherungsprämie Wohngebäudeversicherung" → "Gebäudeversicherung"
- "Wartung Aufzug März 2025" → "Aufzugwartung"

Rechnungsbeschreibung: "${description}"
${vendor_name ? `Lieferant (NICHT im Ergebnis verwenden): "${vendor_name}"` : ""}

Antworte NUR mit dem kurzen Verwendungszweck, nichts anderes.`;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-medium-3-5",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 30,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Mistral error:", response.status, errText);
      throw new Error(`Mistral API error: ${response.status}`);
    }

    const result = await response.json();
    const shortPurpose = result.choices?.[0]?.message?.content?.trim() || "";

    // Build full purpose: "Re. Nr. XXX, <AI short>"
    let fullPurpose = "";
    if (invoice_number) fullPurpose += `Re. Nr. ${invoice_number}`;
    if (shortPurpose) {
      fullPurpose += fullPurpose ? `, ${shortPurpose}` : shortPurpose;
    }

    // Save to DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from("invoices")
      .update({ payment_purpose: fullPurpose })
      .eq("id", invoice_id);

    return new Response(JSON.stringify({ purpose: fullPurpose }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-payment-purpose error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
