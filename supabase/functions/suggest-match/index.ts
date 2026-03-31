import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transaction, invoices, templates } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const txnName = transaction.amount < 0 ? transaction.creditor_name : transaction.debtor_name;
    const txnIban = transaction.amount < 0 ? transaction.creditor_iban : transaction.debtor_iban;

    const candidatesSummary = [
      ...invoices.map((inv: any) => `INVOICE id=${inv.id} number="${inv.invoice_number || ""}" vendor="${inv.vendor_name || ""}" amount=${inv.gross_amount || 0} iban="${inv.vendor_iban || ""}" date="${inv.invoice_date || ""}"`),
      ...templates.map((t: any) => `TEMPLATE id=${t.id} name="${t.name}" vendor="${t.vendor_name || ""}" amount=${t.expected_amount || 0} iban="${t.vendor_iban || ""}" interval="${t.interval || ""}"`),
    ].join("\n");

    const systemPrompt = `Du bist ein Buchhaltungs-Assistent. Du analysierst eine Banktransaktion und findest die am besten passenden Rechnungen oder Vorlagen aus einer Kandidatenliste.

Matching-Kriterien (nach Wichtigkeit):
1. IBAN-Übereinstimmung (stärkster Indikator)
2. Betragsübereinstimmung oder -ähnlichkeit
3. Namensähnlichkeit (Auftraggeber/Empfänger vs. Lieferant)
4. Schlüsselwörter im Verwendungszweck

Gib die besten 1-5 Kandidaten zurück, sortiert nach Relevanz.`;

    const userPrompt = `Transaktion:
- Betrag: ${transaction.amount} €
- Name: ${txnName || "unbekannt"}
- IBAN: ${txnIban || "unbekannt"}
- Verwendungszweck: ${transaction.purpose || "keiner"}
- Datum: ${transaction.booking_date}

Kandidaten:
${candidatesSummary}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_matches",
              description: "Return the best matching candidates for the bank transaction",
              parameters: {
                type: "object",
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "The candidate ID" },
                        score: { type: "number", description: "Confidence score 0-1" },
                        reason: { type: "string", description: "Short German explanation why this matches" },
                      },
                      required: ["id", "score", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["matches"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_matches" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ matches: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-match error:", e);
    return new Response(JSON.stringify({ matches: [], error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
