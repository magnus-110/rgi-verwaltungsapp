import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transaction, invoices, templates, allTransactions } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const txnName = transaction.amount < 0 ? transaction.creditor_name : transaction.debtor_name;
    const txnIban = transaction.amount < 0 ? transaction.creditor_iban : transaction.debtor_iban;

    const candidatesSummary = [
      ...invoices.map((inv: any) => `INVOICE id=${inv.id} number="${inv.invoice_number || ""}" vendor="${inv.vendor_name || ""}" amount=${inv.gross_amount || 0} iban="${inv.vendor_iban || ""}" date="${inv.invoice_date || ""}"`),
      ...templates.map((t: any) => `TEMPLATE id=${t.id} name="${t.name}" vendor="${t.vendor_name || ""}" amount=${t.expected_amount || 0} iban="${t.vendor_iban || ""}" interval="${t.interval || ""}" account_number="${t.account_number || ""}" account_name="${t.account_name || ""}" account_id="${t.account_id || ""}" valid_from="${t.valid_from || ""}" valid_to="${t.valid_to || ""}"`),
    ].join("\n");

    let otherTxnContext = "";
    if (allTransactions && allTransactions.length > 0) {
      const otherTxns = allTransactions
        .filter((t: any) => t.id !== transaction.id)
        .slice(0, 30)
        .map((t: any) => {
          const name = t.amount < 0 ? t.creditor_name : t.debtor_name;
          return `TXN amount=${t.amount} name="${name || ""}" purpose="${t.purpose || ""}" date="${t.booking_date}" status="${t.match_status}"`;
        });
      if (otherTxns.length > 0) {
        otherTxnContext = `\n\nAndere Transaktionen derselben Liegenschaft (für Kontext, z.B. Teilzahlungserkennung):\n${otherTxns.join("\n")}`;
      }
    }

    const systemPrompt = `Du bist ein Buchhaltungs-Assistent für WEG-Hausverwaltungen. Du analysierst eine Banktransaktion und findest die am besten passenden Rechnungen oder Vorlagen aus einer Kandidatenliste.

Matching-Kriterien (nach Wichtigkeit):
1. IBAN-Übereinstimmung (stärkster Indikator)
2. Betragsübereinstimmung oder -ähnlichkeit
3. Namensähnlichkeit (Auftraggeber/Empfänger vs. Lieferant)
4. Schlüsselwörter im Verwendungszweck
5. Zeitliche Gültigkeit: Vorlagen mit valid_from/valid_to nur vorschlagen, wenn das Transaktionsdatum im Gültigkeitszeitraum liegt. Vorlagen ohne Datumseinschränkung gelten immer.
1. IBAN-Übereinstimmung (stärkster Indikator)
2. Betragsübereinstimmung oder -ähnlichkeit
3. Namensähnlichkeit (Auftraggeber/Empfänger vs. Lieferant)
4. Schlüsselwörter im Verwendungszweck

Erweiterte Analyse:
- Prüfe ob der Transaktionsbetrag der SUMME mehrerer Vorlagen entspricht (z.B. Sammeleingänge wie Hausgeld)
- Prüfe ob der Betrag ein TEILBETRAG einer Rechnung ist
- Prüfe ob andere offene Transaktionen zusammen den vollen Rechnungsbetrag ergeben
- Bei Sammelzahlungen: Identifiziere alle Vorlagen, die in der Summe enthalten sein könnten

Vorlagen-Erkennung:
- Wenn KEINE passende Vorlage existiert und die Transaktion auf eine WIEDERKEHRENDE Zahlung hindeutet (z.B. "Abschlag", "monatlich", Kundennummer, regelmäßiger Lieferant wie Strom/Gas/Wasser/Versicherung), schlage eine neue Vorlage vor im template_suggestion Feld.
- Erkennbare Muster: Abschlagszahlungen, Versicherungsbeiträge, Wartungsverträge, Mietzahlungen, Hausgeld.

Gib die besten 1-5 Kandidaten zurück UND einen booking_hint wenn du eine komplexe Zuordnung erkennst UND einen template_suggestion wenn eine neue Vorlage erstellt werden sollte.`;

    const userPrompt = `Transaktion:
- Betrag: ${transaction.amount} €
- Name: ${txnName || "unbekannt"}
- IBAN: ${txnIban || "unbekannt"}
- Verwendungszweck: ${transaction.purpose || "keiner"}
- Datum: ${transaction.booking_date}

Kandidaten:
${candidatesSummary}${otherTxnContext}`;

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
              description: "Return the best matching candidates, an optional booking hint, and an optional template suggestion",
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
                  booking_hint: {
                    type: "object",
                    description: "Optional hint for complex transactions (splits, partial payments). Only set if the transaction requires special handling.",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["split", "partial", "simple"],
                        description: "split = Sammelbuchung (Betrag = Summe mehrerer Vorlagen), partial = Teilzahlung einer Rechnung, simple = einfache 1:1 Zuordnung",
                      },
                      explanation: {
                        type: "string",
                        description: "Detailed German explanation for the user about the booking situation",
                      },
                      suggested_bookings: {
                        type: "array",
                        description: "Pre-filled booking suggestions for the user",
                        items: {
                          type: "object",
                          properties: {
                            account_number: { type: "string", description: "Target account number" },
                            account_name: { type: "string", description: "Target account name" },
                            account_id: { type: "string", description: "Target account ID if known from template" },
                            amount: { type: "number", description: "Booking amount (positive)" },
                            booking_type: { type: "string", enum: ["income", "expense"], description: "income for Zugang, expense for Abgang" },
                            description: { type: "string", description: "Suggested booking text" },
                            related_template_id: { type: "string", description: "Related template ID if applicable" },
                            related_invoice_id: { type: "string", description: "Related invoice ID if applicable" },
                          },
                          required: ["amount", "booking_type", "description"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["type", "explanation", "suggested_bookings"],
                    additionalProperties: false,
                  },
                  template_suggestion: {
                    type: "object",
                    description: "Optional suggestion to create a new booking template. Only set if no matching template exists and the transaction looks like a recurring payment.",
                    properties: {
                      name: { type: "string", description: "Template name, e.g. 'Abschlagszahlung Strom EON'" },
                      vendor_name: { type: "string", description: "Vendor/supplier name" },
                      vendor_iban: { type: "string", description: "Vendor IBAN" },
                      expected_amount: { type: "number", description: "Expected recurring amount (positive)" },
                      interval: { type: "string", description: "Payment interval: monatlich, quartalsweise, halbjährlich, jährlich" },
                      account_number: { type: "string", description: "Suggested account number from chart of accounts" },
                      account_name: { type: "string", description: "Suggested account name" },
                      description: { type: "string", description: "Description/reason for the template suggestion" },
                    },
                    required: ["name", "vendor_name", "expected_amount", "description"],
                    additionalProperties: false,
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
