import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transaction, invoices, templates, allTransactions, historicalBookings } = await req.json();

    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY not configured");

    const txnName = transaction.amount < 0 ? transaction.creditor_name : transaction.debtor_name;
    const txnIban = transaction.amount < 0 ? transaction.creditor_iban : transaction.debtor_iban;

    const candidatesSummary = [
      ...invoices.map((inv: any) => `INVOICE id=${inv.id} number="${inv.invoice_number || ""}" vendor="${inv.vendor_name || ""}" amount=${inv.gross_amount || 0} iban="${inv.vendor_iban || ""}" date="${inv.invoice_date || ""}"`),
      ...templates.map((t: any) => `TEMPLATE id=${t.id} name="${t.name}" vendor="${t.vendor_name || ""}" amount=${t.expected_amount || 0} tolerance=${t.amount_tolerance ?? "none"} iban="${t.vendor_iban || ""}" interval="${t.interval || ""}" account_number="${t.account_number || ""}" account_name="${t.account_name || ""}" account_id="${t.account_id || ""}" valid_from="${t.valid_from || ""}" valid_to="${t.valid_to || ""}"`),
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

    let historicalContext = "";
    if (historicalBookings && historicalBookings.length > 0) {
      const lines = historicalBookings.map((b: any) =>
        `HIST amount=${b.amount} date="${b.date}" has_invoice=${b.has_invoice}`
      );
      historicalContext = `\n\nHistorische Buchungen desselben Kreditors (letzte 2 Jahre):\n${lines.join("\n")}`;
    }

    const systemPrompt = `Du bist ein Buchhaltungs-Assistent für WEG-Hausverwaltungen. Du analysierst eine Banktransaktion und findest die am besten passenden Rechnungen oder Vorlagen aus einer Kandidatenliste.

Matching-Kriterien (nach Wichtigkeit):
1. IBAN-Übereinstimmung (stärkster Indikator)
2. Betragsübereinstimmung oder -ähnlichkeit
3. Namensähnlichkeit (Auftraggeber/Empfänger vs. Lieferant)
4. Schlüsselwörter im Verwendungszweck
5. Zeitliche Gültigkeit: Vorlagen mit valid_from/valid_to nur vorschlagen, wenn das Transaktionsdatum im Gültigkeitszeitraum liegt. Vorlagen ohne Datumseinschränkung gelten immer.

Erweiterte Analyse:
- Prüfe ob der Transaktionsbetrag der SUMME mehrerer Vorlagen entspricht (z.B. Sammeleingänge wie Hausgeld)
- Prüfe ob der Betrag ein TEILBETRAG einer Rechnung ist
- Prüfe ob andere offene Transaktionen zusammen den vollen Rechnungsbetrag ergeben
- Bei Sammelzahlungen: Identifiziere alle Vorlagen, die in der Summe enthalten sein könnten

Vorlagen vs. fehlende Rechnung (WICHTIG!):
- Wenn historische Buchungen desselben Kreditors vorhanden sind, prüfe ob diese ÜBERWIEGEND mit Rechnungen verknüpft waren (has_invoice=true).
- Wenn ja: Erstelle KEINE template_suggestion, sondern setze missing_invoice_hint. Das bedeutet: der Kreditor liefert normalerweise Rechnungen, aber die aktuelle fehlt noch.
- Wenn nein (historisch keine/wenige Rechnungen): Erstelle wie bisher eine template_suggestion für eine neue Vorlage.
- Wenn KEINE historischen Daten vorhanden sind: Nutze dein Urteilsvermögen basierend auf dem Transaktionstyp (z.B. Abschlagszahlungen deuten auf Rechnungen hin).

Vorlagen-Erkennung:
- Wenn KEINE passende Vorlage existiert und die Transaktion auf eine WIEDERKEHRENDE Zahlung hindeutet (z.B. "Abschlag", "monatlich", Kundennummer, regelmäßiger Lieferant wie Strom/Gas/Wasser/Versicherung), schlage eine neue Vorlage vor im template_suggestion Feld — ABER NUR wenn historisch keine Rechnungen vorhanden waren.
- Erkennbare Muster: Abschlagszahlungen, Versicherungsbeiträge, Wartungsverträge, Mietzahlungen, Hausgeld.

Wirtschaftsjahr & Abgrenzung:
- Standardmäßig ist das Wirtschaftsjahr = Jahr des Kontoauszugsdatums (booking_date).
- Prüfe ob Verwendungszweck, Rechnungsdatum oder erkennbare Leistungszeiträume auf ein ANDERES Wirtschaftsjahr hindeuten.
- Wenn Rechnungsdatum in einem anderen Jahr als das Kontoauszugsdatum liegt → Abgrenzung empfehlen.
- Wenn ein Leistungszeitraum Jahresgrenzen übergreift (z.B. Versicherung 07/2024–06/2025) → Abgrenzung empfehlen.
- Setze fiscal_year_hint mit dem empfohlenen Wirtschaftsjahr, ob eine Abgrenzungsbuchung nötig ist, und einer Begründung.

Wichtig bei fehlenden Metadaten:
- Manche Transaktionen (z.B. Bankgebühren, Kontoführungsgebühren) haben KEINEN Kreditor-Namen und KEINE IBAN.
- In diesen Fällen: Matche anhand des Verwendungszwecks UND Betrags gegen existierende Vorlagen.
- Beispiel: Verwendungszweck "Abrechnung" + Betrag ~12€ → Vorlage "Bankgebühren / Kontoführung" mit Toleranz ±5€
- Bevorzuge IMMER eine existierende Vorlage gegenüber dem Vorschlag einer neuen Vorlage.

Gib die besten 1-5 Kandidaten zurück UND einen booking_hint wenn du eine komplexe Zuordnung erkennst UND einen template_suggestion ODER missing_invoice_hint wenn angemessen UND einen fiscal_year_hint wenn das Wirtschaftsjahr nicht trivial ist.`;

    const userPrompt = `Transaktion:
- Betrag: ${transaction.amount} €
- Name: ${txnName || "unbekannt"}
- IBAN: ${txnIban || "unbekannt"}
- Verwendungszweck: ${transaction.purpose || "keiner"}
- Datum: ${transaction.booking_date}

Kandidaten:
${candidatesSummary}${otherTxnContext}${historicalContext}`;

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_matches",
              description: "Return the best matching candidates, an optional booking hint, an optional template suggestion, and an optional missing invoice hint",
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
                    description: "Optional suggestion to create a new booking template. Only set if no matching template exists, the transaction looks like a recurring payment, AND historical bookings did NOT predominantly have invoices.",
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
                  missing_invoice_hint: {
                    type: "object",
                    description: "Set this when the creditor historically had invoices but no matching invoice was found for this transaction.",
                    properties: {
                      vendor_name: { type: "string", description: "Name of the vendor/creditor" },
                      expected_invoice_description: { type: "string", description: "What kind of invoice is expected" },
                      last_invoice_date: { type: "string", description: "Date of the last known invoice from this vendor" },
                      explanation: { type: "string", description: "German explanation for the user" },
                    },
                    required: ["vendor_name", "explanation"],
                    additionalProperties: false,
                  },
                  fiscal_year_hint: {
                    type: "object",
                    description: "Set this when the fiscal year is not simply the year of the booking_date, or when an accrual booking (Abgrenzungsbuchung) is recommended. Always set fiscal_year to the recommended year.",
                    properties: {
                      fiscal_year: { type: "number", description: "Recommended fiscal year for this booking" },
                      needs_accrual: { type: "boolean", description: "True if an accrual booking (Abgrenzungsbuchung) is recommended" },
                      accrual_explanation: { type: "string", description: "German explanation why accrual is needed or why a different fiscal year is recommended" },
                      service_period_from: { type: "string", description: "Start of the service/performance period if identifiable (ISO date)" },
                      service_period_to: { type: "string", description: "End of the service/performance period if identifiable (ISO date)" },
                    },
                    required: ["fiscal_year", "needs_accrual", "accrual_explanation"],
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
