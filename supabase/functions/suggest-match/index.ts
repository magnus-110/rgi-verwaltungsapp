import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transaction, invoices, templates, allTransactions, historicalBookings, billingPeriods, accounts, bookingInstructions } = await req.json();

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

    // Build accounts context
    let accountsContext = "";
    if (accounts && accounts.length > 0) {
      const lines = accounts.map((a: any) =>
        `KONTO ${a.account_number} "${a.account_name}" Kategorie="${a.category}" §35a=${a.is_35a_relevant ? "JA" : "NEIN"} id="${a.id}"`
      );
      accountsContext = `\n\nVERFÜGBARE KONTEN (nur diese Konten verwenden!):\n${lines.join("\n")}`;
    }

    // Build booking instructions context
    let instructionsContext = "";
    if (bookingInstructions) {
      instructionsContext = `\n\nLIEGENSCHAFTSSPEZIFISCHE BUCHUNGSHINWEISE (HÖCHSTE PRIORITÄT bei der Kontenzuordnung!):\n${bookingInstructions}`;
    }

    const systemPrompt = `Du bist ein hochspezialisierter WEG-Buchhalter (Deutschland) für automatisierte Belegverbuchung. Du analysierst Banktransaktionen und findest die am besten passenden Rechnungen oder Vorlagen aus einer Kandidatenliste. Du arbeitest ausschließlich mit dem übergebenen Kontenrahmen.

MATCHING-KRITERIEN (nach Wichtigkeit):
1. IBAN-Übereinstimmung (stärkster Indikator)
2. Betragsübereinstimmung oder -ähnlichkeit
3. Namensähnlichkeit (Auftraggeber/Empfänger vs. Lieferant)
4. Schlüsselwörter im Verwendungszweck
5. Zeitliche Gültigkeit: Vorlagen mit valid_from/valid_to nur vorschlagen, wenn das Transaktionsdatum im Gültigkeitszeitraum liegt. Vorlagen ohne Datumseinschränkung gelten immer.

BUCHUNGSHINWEISE (höchste Priorität!):
Wenn liegenschaftsspezifische Buchungshinweise mitgeliefert werden, haben diese HÖCHSTE PRIORITÄT bei der Kontenzuordnung. Sie überschreiben im Zweifel die allgemeinen Regeln.

KONTENZUORDNUNG:
- Verwende AUSSCHLIESSLICH Konten aus dem übergebenen Kontenrahmen.
- Setze account_number, account_name und account_id in den suggested_bookings.
- Standard-Gegenkonto für Bankzahlungen: "1800" (Bank).

TYPISCHE WEG-KONTENZUORDNUNGEN (Orientierung):
- Straßenreinigung → 1000, §35a JA (Arbeitsanteil ~100%)
- Müllabfuhr/Abfallentsorgung → 1010, §35a NEIN
- Wasserversorgung → 1030, §35a NEIN
- Abwasser/Kanal → 1040, §35a NEIN
- Allgemeinstrom → 1050, §35a NEIN
- Hausmeister → 1060, §35a JA (Arbeitsanteil ~100%)
- Winterdienst → 1061, §35a JA (Arbeitsanteil ~80%)
- Hausreinigung/Treppenhausreinigung → 1070, §35a JA (Arbeitsanteil ~100%)
- Gartenpflege → 1080, §35a JA (Arbeitsanteil ~80%)
- Ungezieferbekämpfung/Schädlingsbekämpfung → 1090, §35a JA (Arbeitsanteil ~100%)
- Wartung allgemein → 1100, §35a JA (Arbeitsanteil ~50%)
- Aufzugwartung → 1103, §35a JA (Arbeitsanteil ~50%)
- Grundsteuer → 1200, §35a NEIN
- Versicherungen → 1300, §35a NEIN
- Heizung/Warmwasser → 1400, §35a NEIN
- Brennstoffkauf → 1410, §35a NEIN
- Heizungswartung → 1440, §35a JA (Arbeitsanteil ~70%)
- Vorauszahlungen Gas → 1470 (Vorauszahlungskonto!)
- Vorauszahlungen Fernwärme → 1471 (Vorauszahlungskonto!)
- Vorauszahlungen Strom → 1472 (Vorauszahlungskonto!)
- Vorauszahlungen Wasser → 1473 (Vorauszahlungskonto!)
- Verwaltervergütung → 1500, §35a NEIN
- Bankgebühren/Kontoführung → 1520, §35a NEIN
- Instandhaltung/Reparaturen → 1600, §35a JA (Arbeitsanteil ~60%)
- Gegenkonto Bank → 1800

ABSCHLAGSZAHLUNGEN:
- Monatliche Abschläge für Gas, Strom, Wasser, Fernwärme IMMER auf Vorauszahlungskonten (1470-1473) buchen, NICHT auf Aufwandskonten!
- Erkennbar an: "Abschlag", "Vorauszahlung", regelmäßige gleiche Beträge an Versorger.

§35a EStG REGELN:
- is_35a_relevant = true bei Arbeitsleistungen: Hausmeister, Reinigung, Gartenpflege, Wartung, Winterdienst, Schädlingsbekämpfung, Reparaturen (Arbeitsanteil).
- is_35a_relevant = false bei: Material, Energie, Versicherungen, Steuern, Bankgebühren, Verwaltung.
- amount_35a = geschätzter Netto-Arbeitsanteil des Buchungsbetrags (Bruttobetrag × Arbeitsanteil-Prozent / 1.19).

ERWEITERTE ANALYSE:
- Prüfe ob der Transaktionsbetrag der SUMME mehrerer Vorlagen entspricht (Sammeleingänge wie Hausgeld)
- Prüfe ob der Betrag ein TEILBETRAG einer Rechnung ist
- Prüfe ob andere offene Transaktionen zusammen den vollen Rechnungsbetrag ergeben
- Bei Sammelzahlungen: Identifiziere alle Vorlagen, die in der Summe enthalten sein könnten

VORLAGEN vs. FEHLENDE RECHNUNG:
- Wenn historische Buchungen desselben Kreditors ÜBERWIEGEND mit Rechnungen verknüpft waren (has_invoice=true): Setze missing_invoice_hint statt template_suggestion.
- Wenn historisch keine/wenige Rechnungen: Erstelle template_suggestion für neue Vorlage.
- Ohne historische Daten: Nutze Urteilsvermögen (Abschläge → Rechnungen erwartet).

WIRTSCHAFTSJAHR & ABGRENZUNG:
- Das Wirtschaftsjahr muss NICHT dem Kalenderjahr entsprechen! Nutze die übergebenen Abrechnungszeiträume.
- Setze fiscal_year_hint NUR wenn das empfohlene Wirtschaftsjahr ABWEICHT vom Kalenderjahr des Buchungsdatums ODER bei Abgrenzungsbedarf.

FEHLENDE METADATEN:
- Manche Transaktionen haben KEINEN Kreditor-Namen und KEINE IBAN (z.B. Bankgebühren).
- Matche anhand Verwendungszweck UND Betrag gegen existierende Vorlagen.

SCORE-VERGABE:
- NUR Kandidaten mit Score > 0.5 zurückgeben.
- Lieber wenige präzise Vorschläge als viele unsichere.

Gib die besten 1-5 Kandidaten zurück UND booking_hint bei komplexer Zuordnung UND template_suggestion/missing_invoice_hint wenn angemessen UND fiscal_year_hint wenn nötig.`;

    let billingPeriodContext = "";
    if (billingPeriods && billingPeriods.length > 0) {
      const lines = billingPeriods.map((bp: any) =>
        `WJ ${bp.fiscal_year}: ${bp.period_from} bis ${bp.period_to}`
      );
      billingPeriodContext = `\n\nAbrechnungszeiträume (Wirtschaftsjahre) dieser Liegenschaft:\n${lines.join("\n")}`;
    }

    const userPrompt = `Transaktion:
- Betrag: ${transaction.amount} €
- Name: ${txnName || "unbekannt"}
- IBAN: ${txnIban || "unbekannt"}
- Verwendungszweck: ${transaction.purpose || "keiner"}
- Datum: ${transaction.booking_date}

Kandidaten:
${candidatesSummary}${otherTxnContext}${historicalContext}${billingPeriodContext}${accountsContext}${instructionsContext}`;

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
              description: "Return the best matching candidates, booking hints, template suggestions, and fiscal year hints",
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
                            account_number: { type: "string", description: "Target account number from chart of accounts" },
                            account_name: { type: "string", description: "Target account name" },
                            account_id: { type: "string", description: "Target account ID from chart of accounts" },
                            counter_account_number: { type: "string", description: "Counter account number, default '1800' (Bank)" },
                            amount: { type: "number", description: "Booking amount (positive)" },
                            booking_type: { type: "string", enum: ["income", "expense"], description: "income for Zugang, expense for Abgang" },
                            description: { type: "string", description: "Suggested booking text" },
                            related_template_id: { type: "string", description: "Related template ID if applicable" },
                            related_invoice_id: { type: "string", description: "Related invoice ID if applicable" },
                            is_35a_relevant: { type: "boolean", description: "True if §35a EStG relevant (haushaltsnahe Dienstleistung/Handwerkerleistung)" },
                            amount_35a: { type: "number", description: "Geschätzter Netto-Arbeitsanteil für §35a (Bruttobetrag × Arbeitsanteil% / 1.19)" },
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
                    description: "Set this when the fiscal year is not simply the year of the booking_date, or when an accrual booking (Abgrenzungsbuchung) is recommended.",
                    properties: {
                      fiscal_year: { type: "number", description: "Recommended fiscal year for this booking" },
                      needs_accrual: { type: "boolean", description: "True if an accrual booking is recommended" },
                      accrual_explanation: { type: "string", description: "German explanation why accrual is needed or why a different fiscal year is recommended" },
                      service_period_from: { type: "string", description: "Start of service period if identifiable (ISO date)" },
                      service_period_to: { type: "string", description: "End of service period if identifiable (ISO date)" },
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
