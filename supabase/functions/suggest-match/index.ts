// suggest-match v2: RAG + Structured Prompting (bank-zentrische Logik)
//
// Erweiterungen ggü. v1:
//  - Embedding der aktuellen Transaktion (mistral-embed) und Abruf ähnlicher
//    bestätigter Buchungen (booking_embeddings) via find_similar_bookings RPC.
//  - Vendor-Memory-Lookup (find_vendor_memory) für Cold-Start neuer Liegenschaften.
//  - Strukturierter System-Prompt mit Bank-Centric Booking Logic
//    (expense: account=Bank, counter_account=Aufwand; income: umgekehrt).
//  - Smart-Whitelist: RAG-Empfehlungen + Building-Hinweise + Core-Konten.
//  - Validation Layer (Soll=Haben, Konto-Existenz, §35a-Plausibilität).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Core-Konten, die immer in der Whitelist sein müssen
const CORE_ACCOUNT_NUMBERS = new Set([
  "1700", // IHR-Soll (WEG)
  "1710", // IHR-Soll detailliert
  "1800", // Bank
  "1810", "1820", "1830", // weitere Bank-/Verrechnungskonten
  "4000", // Eröffnungsbilanz
]);

// ---------- Mistral Embed ----------
async function embedText(text: string): Promise<number[] | null> {
  if (!MISTRAL_API_KEY) return null;
  try {
    const r = await fetch("https://api.mistral.ai/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "mistral-embed", input: [text.slice(0, 8000)] }),
    });
    if (!r.ok) {
      console.warn("embed failed:", r.status, (await r.text()).slice(0, 200));
      return null;
    }
    const data = await r.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.warn("embed error:", e);
    return null;
  }
}

function buildEmbedInput(txn: any): string {
  const isExpense = (txn.amount ?? 0) < 0;
  const counterparty = isExpense ? (txn.creditor_name || "") : (txn.debtor_name || "");
  const iban = isExpense ? (txn.creditor_iban || "") : (txn.debtor_iban || "");
  const purpose = (txn.purpose || "").replace(/\s+/g, " ").trim();
  return [
    `KREDITOR: ${counterparty || "(unbekannt)"} | IBAN: ${iban || "-"}`,
    `BETRAG: ${txn.amount} EUR | TYP: ${isExpense ? "expense" : "income"}`,
    `VERWENDUNGSZWECK: ${purpose.slice(0, 500)}`,
    `BUCHUNGSTEXT: ${(txn.purpose || "").slice(0, 200)}`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      transaction,
      invoices = [],
      templates = [],
      allTransactions = [],
      historicalBookings = [],
      billingPeriods = [],
      accounts = [],
      bookingInstructions,
      buildingId,
      managementMode,
    } = await req.json();

    if (!MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY not configured");

    const txnIsExpense = (transaction.amount ?? 0) < 0;
    const txnName = txnIsExpense ? transaction.creditor_name : transaction.debtor_name;
    const txnIban = txnIsExpense ? transaction.creditor_iban : transaction.debtor_iban;

    // ---------- Load invoice line items for matched invoice (§35a precision) ----------
    let matchedInvoiceLineItems: any[] | null = null;
    let matchedInvoiceMeta: { id: string; gross: number; vat_rate: number | null; number: string | null } | null = null;
    if (transaction.matched_invoice_id) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, invoice_number, gross_amount, vat_rate, line_items")
        .eq("id", transaction.matched_invoice_id)
        .maybeSingle();
      if (inv && Array.isArray((inv as any).line_items) && (inv as any).line_items.length > 0) {
        matchedInvoiceLineItems = (inv as any).line_items;
        matchedInvoiceMeta = {
          id: (inv as any).id,
          gross: Number((inv as any).gross_amount) || 0,
          vat_rate: (inv as any).vat_rate != null ? Number((inv as any).vat_rate) : null,
          number: (inv as any).invoice_number || null,
        };
      }
    }
    // ---------- RAG Tier 1+2: Similar bookings ----------
    let ragSimilar: any[] = [];
    let ragOtherBuildings: any[] = [];
    let ragVendorMemory: any[] = [];
    const queryEmbedding = await embedText(buildEmbedInput(transaction));

    if (queryEmbedding && buildingId && managementMode) {
      // Tier 1: gleiche Liegenschaft
      const { data: sim1 } = await supabase.rpc("find_similar_bookings" as any, {
        query_embedding: queryEmbedding as any,
        p_building_id: buildingId,
        p_management_mode: managementMode,
        p_match_count: 6,
        p_similarity_threshold: 0.72,
        p_include_other_buildings: false,
      });
      ragSimilar = sim1 || [];

      // Tier 2: andere Liegenschaften gleichen Modus (Cold-Start-Hilfe)
      if (ragSimilar.length < 3) {
        const { data: sim2 } = await supabase.rpc("find_similar_bookings" as any, {
          query_embedding: queryEmbedding as any,
          p_building_id: buildingId,
          p_management_mode: managementMode,
          p_match_count: 5,
          p_similarity_threshold: 0.78,
          p_include_other_buildings: true,
        });
        ragOtherBuildings = (sim2 || []).filter((r: any) => r.scope !== "same_building");
      }
    }

    // Tier 3: Vendor Memory
    if (managementMode && (txnIban || txnName)) {
      const { data: vm } = await supabase.rpc("find_vendor_memory" as any, {
        p_vendor_iban: txnIban || null,
        p_vendor_name: txnName || null,
        p_management_mode: managementMode,
      });
      ragVendorMemory = vm || [];
    }

    // ---------- Smart Whitelist ----------
    // RAG-Konten + Core-Konten + Konten aus bookingInstructions (heuristisch)
    const ragAccountNumbers = new Set<string>();
    [...ragSimilar, ...ragOtherBuildings].forEach((r: any) => {
      if (r.account_number) ragAccountNumbers.add(r.account_number);
      if (r.counter_account_number) ragAccountNumbers.add(r.counter_account_number);
    });
    ragVendorMemory.forEach((v: any) => v.account_number && ragAccountNumbers.add(v.account_number));
    CORE_ACCOUNT_NUMBERS.forEach((n) => ragAccountNumbers.add(n));

    // ---------- Build Prompt Sections ----------
    const candidatesSummary = [
      ...invoices.map((inv: any) =>
        `INVOICE id=${inv.id} number="${inv.invoice_number || ""}" vendor="${inv.vendor_name || ""}" amount=${inv.gross_amount || 0} iban="${inv.vendor_iban || ""}" date="${inv.invoice_date || ""}"`,
      ),
      ...templates.map((t: any) =>
        `TEMPLATE id=${t.id} name="${t.name}" vendor="${t.vendor_name || ""}" amount=${t.expected_amount || 0} tolerance=${t.amount_tolerance ?? "none"} iban="${t.vendor_iban || ""}" interval="${t.interval || ""}" account_number="${t.account_number || ""}" account_name="${t.account_name || ""}" account_id="${t.account_id || ""}" valid_from="${t.valid_from || ""}" valid_to="${t.valid_to || ""}"`,
      ),
    ].join("\n");

    let otherTxnContext = "";
    if (allTransactions.length > 0) {
      const otherTxns = allTransactions
        .filter((t: any) => t.id !== transaction.id)
        .slice(0, 30)
        .map((t: any) => {
          const name = t.amount < 0 ? t.creditor_name : t.debtor_name;
          return `TXN amount=${t.amount} name="${name || ""}" purpose="${t.purpose || ""}" date="${t.booking_date}" status="${t.match_status}"`;
        });
      if (otherTxns.length > 0) {
        otherTxnContext = `\n\nAndere Transaktionen derselben Liegenschaft (Kontext für Teilzahlungen/Sammelbuchungen):\n${otherTxns.join("\n")}`;
      }
    }

    let historicalContext = "";
    if (historicalBookings.length > 0) {
      const lines = historicalBookings.map((b: any) =>
        `HIST amount=${b.amount} date="${b.date}" has_invoice=${b.has_invoice}`,
      );
      historicalContext = `\n\nHistorische Buchungen desselben Kreditors (letzte 2 Jahre):\n${lines.join("\n")}`;
    }

    // RAG: Ähnliche Buchungen ALS HAUPTKONTEXT
    let ragContext = "";
    if (ragSimilar.length > 0 || ragOtherBuildings.length > 0) {
      const renderRag = (r: any) => {
        const k = r.booking_type === "expense" ? r.counter_account_number : r.account_number;
        const kn = r.booking_type === "expense" ? r.counter_account_name : r.account_name;
        return `  [Sim ${(r.similarity * 100).toFixed(1)}% | ${r.scope}] Kreditor="${r.creditor_name || "-"}" Betrag=${r.amount} ${r.booking_type} → Sachkonto ${k} "${kn}" §35a=${r.is_35a_relevant} Zweck="${(r.purpose_text || "").slice(0, 80)}" Buchungstext="${(r.booking_description || "").slice(0, 80)}"`;
      };
      const sec1 = ragSimilar.length > 0
        ? `\nÄHNLICHE BESTÄTIGTE BUCHUNGEN (gleiche Liegenschaft, höchste Priorität!):\n${ragSimilar.map(renderRag).join("\n")}`
        : "";
      const sec2 = ragOtherBuildings.length > 0
        ? `\n\nÄHNLICHE BUCHUNGEN ANDERER LIEGENSCHAFTEN (Cold-Start-Referenz, niedrigere Priorität):\n${ragOtherBuildings.map(renderRag).join("\n")}`
        : "";
      ragContext = `\n\n========== RAG-KONTEXT (gelernte Buchungsmuster) ==========${sec1}${sec2}\n========================================================`;
    }

    let vendorMemoryContext = "";
    if (ragVendorMemory.length > 0) {
      const lines = ragVendorMemory.map((v: any) =>
        `  Konto ${v.account_number} (Kategorie: ${v.account_category || "?"}, ${v.usage_count}× verwendet, §35a=${v.is_35a_relevant}, Muster="${v.purpose_pattern || "-"}")`,
      );
      vendorMemoryContext = `\n\nVENDOR-MEMORY (was andere Liegenschaften für diesen Lieferanten typischerweise buchen):\n${lines.join("\n")}`;
    }

    // Accounts: Whitelist-Markierung
    let accountsContext = "";
    if (accounts.length > 0) {
      const lines = accounts.map((a: any) => {
        const isWhitelisted = ragAccountNumbers.has(a.account_number);
        const marker = isWhitelisted ? " ⭐ EMPFOHLEN" : "";
        return `KONTO ${a.account_number} "${a.account_name}" Kat="${a.category}" §35a=${a.is_35a_relevant ? "JA" : "NEIN"} id="${a.id}"${marker}`;
      });
      accountsContext = `\n\nVERFÜGBARE KONTEN (nur diese Konten verwenden! ⭐ = vom RAG empfohlen):\n${lines.join("\n")}`;
    }

    let instructionsContext = "";
    if (bookingInstructions) {
      instructionsContext = `\n\nLIEGENSCHAFTSSPEZIFISCHE BUCHUNGSHINWEISE (HÖCHSTE PRIORITÄT bei Kontenzuordnung!):\n${bookingInstructions}`;
    }

    let billingPeriodContext = "";
    if (billingPeriods.length > 0) {
      const lines = billingPeriods.map((bp: any) =>
        `WJ ${bp.fiscal_year}: ${bp.period_from} bis ${bp.period_to}`,
      );
      billingPeriodContext = `\n\nAbrechnungszeiträume (Wirtschaftsjahre):\n${lines.join("\n")}`;
    }

    // ---------- Invoice Line Items (für präzise §35a-Auswahl) ----------
    let lineItemsContext = "";
    if (matchedInvoiceLineItems && matchedInvoiceMeta) {
      const fmtAmount = (v: any) => {
        const n = Number(v) || 0;
        return n.toFixed(2);
      };
      const lines = matchedInvoiceLineItems.map((it: any, idx: number) => {
        const desc = (it?.description || it?.name || "").toString().replace(/\s+/g, " ").slice(0, 200);
        const net = fmtAmount(it?.amount ?? it?.total ?? 0);
        const vat = it?.vat_rate != null ? `${it.vat_rate}%` : "?";
        return `  [${idx}] "${desc}" — netto ${net} € (USt ${vat})`;
      });
      lineItemsContext = `\n\nRECHNUNGSPOSITIONEN (Rechnung ${matchedInvoiceMeta.number || matchedInvoiceMeta.id}, brutto ${matchedInvoiceMeta.gross.toFixed(2)} €):\n${lines.join("\n")}\n\n` +
        `→ Für §35a MUSST du paragraph_35a.selected_line_items mit den Indizes der Lohn-/Anfahrt-Positionen befüllen. Material/Ersatzteile/Gerätekosten NIEMALS auswählen. Pro Position eine kurze reason.`;
    }


    // ---------- System Prompt: Bank-Centric Logic ----------
    const systemPrompt = `Du bist ein hochspezialisierter WEG-Buchhalter (Deutschland) für automatisierte Belegverbuchung. Du arbeitest BANK-ZENTRISCH.

╔════════════════════════════════════════════════════════════════════╗
║ BANK-ZENTRISCHE BUCHUNGSLOGIK (kritisch — niemals abweichen!)      ║
╠════════════════════════════════════════════════════════════════════╣
║ Jede Banktransaktion erzeugt EINE Buchung mit account_id +         ║
║ counter_account_id. Die Rollen ergeben sich aus booking_type:      ║
║                                                                    ║
║   booking_type="expense" (Geld geht VOM Bankkonto WEG):            ║
║     account_id          = BANKKONTO (i.d.R. 1800)                  ║
║     counter_account_id  = AUFWANDSKONTO (1000-1700)                ║
║     amount              = positiv                                  ║
║                                                                    ║
║   booking_type="income" (Geld kommt AUF das Bankkonto):            ║
║     account_id          = BANKKONTO (i.d.R. 1800)                  ║
║     counter_account_id  = ERTRAGS-/PERSONENKONTO                   ║
║     amount              = positiv                                  ║
║                                                                    ║
║ NIEMALS Vorzeichen verwenden, um Richtung anzuzeigen.              ║
║ booking_type ist die EINZIGE Quelle der Wahrheit.                  ║
╚════════════════════════════════════════════════════════════════════╝

PRIORITÄTEN (in dieser Reihenfolge):
1. LIEGENSCHAFTSSPEZIFISCHE BUCHUNGSHINWEISE — überschreiben alles
2. RAG-KONTEXT (ähnliche bestätigte Buchungen, ⭐-markierte Konten) — sehr stark gewichten
3. VENDOR-MEMORY (Cross-Building-Wissen) — gut für Cold-Start
4. Verfügbare Vorlagen / Rechnungen
5. Allgemeine WEG-Heuristiken (siehe unten)

RECHNUNGSTEXT vor LIEFERANTENNAME:
- Manche Lieferanten machen MEHRERE Aufgaben (z.B. ein Hausmeister auch Gartenpflege).
- Analysiere VERWENDUNGSZWECK und ggf. Rechnungspositionen sorgfältig.
- Wenn der Verwendungszweck klar auf eine andere Tätigkeit deutet als der typische Lieferant,
  hat der TEXT Vorrang vor dem Lieferantennamen.
- Beispiel: Hausmeister "Müller" — wenn Zweck "Heckenschnitt", dann 1080 Gartenpflege, nicht 1060 Hausmeister.

KONTENZUORDNUNG (Kontenrahmen ist zwingend):
- Verwende AUSSCHLIESSLICH Konten aus dem übergebenen Kontenrahmen.
- Setze in suggested_bookings IMMER: account_id (Bank), counter_account_id (Sachkonto),
  account_number, account_name, counter_account_number, counter_account_name, booking_type, amount.

TYPISCHE WEG-KONTENZUORDNUNGEN (Fallback wenn kein RAG vorhanden):
- 1000 Straßenreinigung (§35a JA, ~100% Arbeitsanteil)
- 1010 Müllabfuhr (§35a NEIN)
- 1030 Wasser (§35a NEIN)        - 1040 Abwasser (§35a NEIN)
- 1050 Allgemeinstrom (§35a NEIN)
- 1060 Hausmeister (§35a JA, ~100%)
- 1061 Winterdienst (§35a JA, ~80%)
- 1070 Hausreinigung (§35a JA, ~100%)
- 1080 Gartenpflege (§35a JA, ~80%)
- 1090 Schädlingsbekämpfung (§35a JA, ~100%)
- 1100 Wartung allg. (§35a JA, ~50%)  - 1103 Aufzugwartung (§35a JA, ~50%)
- 1200 Grundsteuer    - 1300 Versicherung
- 1400 Heizung/WW    - 1410 Brennstoff   - 1440 Heizungswartung (§35a JA, ~70%)
- 1470 VZ Gas, 1471 VZ Fernwärme, 1472 VZ Strom, 1473 VZ Wasser (Vorauszahlungskonten!)
- 1500 Verwaltervergütung    - 1520 Bankgebühren
- 1600 Instandhaltung (§35a JA, ~60%)
- 1700/1710 IHR-Soll (Hausgeld-Forderungen)
- 1800 Bank (Standard-Bankkonto)

ABSCHLAGSZAHLUNGEN:
- Monatliche regelmäßige Beträge an Versorger → IMMER Vorauszahlungskonten 1470-1473.
- Stichworte: "Abschlag", "Vorauszahlung", "monatliche Abrechnung".

§35a EStG — POSITIONSBASIERT (KEINE PAUSCHALEN!):
- is_35a_relevant=true bei Arbeitsleistung (Reinigung, Hausmeister, Wartung, Reparatur).
- Wenn RECHNUNGSPOSITIONEN vorhanden sind: Du MUSST jede Position einzeln prüfen und nur
  die echten Lohn-/Arbeits-/Anfahrtspositionen in paragraph_35a.selected_line_items
  per Index angeben. Material, Ersatzteile, Geräte- und Stoffkosten NIEMALS auswählen.
  Für jede gewählte Position eine kurze reason (z.B. "Arbeitslohn Wartung", "Anfahrt").
  amount_35a NICHT setzen — der Server berechnet die Summe aus deinen ausgewählten Positionen.
- Wenn KEINE Rechnungspositionen vorliegen: is_35a_relevant darf true sein, aber lasse
  paragraph_35a.selected_line_items leer und amount_35a leer/null. Der Nutzer trägt
  den Lohnanteil dann manuell ein. NIEMALS einen geschätzten Betrag erfinden.
- Die alten Pauschalsätze (~50%, ~80% etc.) dienen NUR zur Plausibilitätskontrolle deiner
  Positionsauswahl — nicht als Berechnungsbasis.

ERWEITERTE ANALYSE:
- Sammelzahlungen: Prüfe ob Betrag = Summe mehrerer Vorlagen (Hausgeld!).
- Teilzahlungen: Prüfe ob Betrag ein Teil einer Rechnung ist.
- Bei Sammelzahlungen identifiziere ALLE enthaltenen Vorlagen.

VORLAGE vs FEHLENDE RECHNUNG:
- Historische Buchungen meist mit Rechnung → missing_invoice_hint statt template_suggestion.
- Historisch ohne Rechnungen → template_suggestion.

WIRTSCHAFTSJAHR:
- Nicht zwingend = Kalenderjahr! Nutze Abrechnungszeiträume.
- fiscal_year_hint nur bei Abweichung oder Abgrenzungsbedarf.

VALIDIERUNG (deine Vorschläge müssen erfüllen):
- account_id und counter_account_id müssen aus dem übergebenen Kontenrahmen stammen.
- account_id ≠ counter_account_id.
- amount > 0.
- booking_type ist Pflicht ("expense" oder "income").

SCORE-VERGABE:
- NUR Kandidaten mit Score > 0.5 zurückgeben.
- Lieber wenige präzise Vorschläge als viele unsichere.`;

    const userPrompt = `Transaktion:
- Betrag: ${transaction.amount} € (${txnIsExpense ? "Abgang → expense" : "Zugang → income"})
- Name: ${txnName || "unbekannt"}
- IBAN: ${txnIban || "unbekannt"}
- Verwendungszweck: ${transaction.purpose || "keiner"}
- Datum: ${transaction.booking_date}

Kandidaten:
${candidatesSummary || "(keine offenen Rechnungen/Vorlagen)"}${otherTxnContext}${historicalContext}${ragContext}${vendorMemoryContext}${billingPeriodContext}${accountsContext}${instructionsContext}`;

    // ---------- Mistral Call ----------
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
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
              description: "Return best matching candidates and bank-centric booking suggestions.",
              parameters: {
                type: "object",
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        score: { type: "number" },
                        reason: { type: "string" },
                      },
                      required: ["id", "score", "reason"],
                      additionalProperties: false,
                    },
                  },
                  booking_hint: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["split", "partial", "simple"] },
                      explanation: { type: "string" },
                      suggested_bookings: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            account_number: { type: "string", description: "BANK-Kontonummer (Quelle der Wahrheit: i.d.R. 1800)" },
                            account_name: { type: "string" },
                            account_id: { type: "string", description: "BANK account_id" },
                            counter_account_number: { type: "string", description: "SACHKONTO-Nummer (Aufwand bei expense, Ertrag bei income)" },
                            counter_account_name: { type: "string" },
                            counter_account_id: { type: "string", description: "SACHKONTO account_id (zwingend!)" },
                            amount: { type: "number", description: "POSITIV. Richtung über booking_type." },
                            booking_type: { type: "string", enum: ["income", "expense"] },
                            description: { type: "string" },
                            related_template_id: { type: "string" },
                            related_invoice_id: { type: "string" },
                            is_35a_relevant: { type: "boolean" },
                            amount_35a: { type: "number" },
                            confidence: { type: "number", description: "Eigene Konfidenz 0-1 für DIESEN Buchungsvorschlag" },
                            rag_references: { type: "array", items: { type: "string" }, description: "Kurze Hinweise welche RAG-Treffer diesen Vorschlag stützen" },
                          },
                          required: ["amount", "booking_type", "description", "counter_account_number"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["type", "explanation", "suggested_bookings"],
                    additionalProperties: false,
                  },
                  template_suggestion: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      vendor_name: { type: "string" },
                      vendor_iban: { type: "string" },
                      expected_amount: { type: "number" },
                      interval: { type: "string" },
                      account_number: { type: "string" },
                      account_name: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["name", "vendor_name", "expected_amount", "description"],
                    additionalProperties: false,
                  },
                  missing_invoice_hint: {
                    type: "object",
                    properties: {
                      vendor_name: { type: "string" },
                      expected_invoice_description: { type: "string" },
                      last_invoice_date: { type: "string" },
                      explanation: { type: "string" },
                    },
                    required: ["vendor_name", "explanation"],
                    additionalProperties: false,
                  },
                  fiscal_year_hint: {
                    type: "object",
                    properties: {
                      fiscal_year: { type: "number" },
                      needs_accrual: { type: "boolean" },
                      accrual_explanation: { type: "string" },
                      service_period_from: { type: "string" },
                      service_period_to: { type: "string" },
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
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    // ---------- VALIDATION LAYER ----------
    const validationWarnings: string[] = [];
    const accountsByNumber = new Map<string, any>();
    accounts.forEach((a: any) => accountsByNumber.set(a.account_number, a));

    if (parsed.booking_hint?.suggested_bookings) {
      parsed.booking_hint.suggested_bookings = parsed.booking_hint.suggested_bookings
        .map((sb: any) => {
          // Auto-fix Bank-Konto wenn fehlt
          if (!sb.account_number) sb.account_number = "1800";
          if (!sb.account_name) sb.account_name = accountsByNumber.get(sb.account_number)?.account_name || "Bank";
          if (!sb.account_id) sb.account_id = accountsByNumber.get(sb.account_number)?.id;

          // counter_account anhand Nummer auflösen
          if (sb.counter_account_number && !sb.counter_account_id) {
            const ca = accountsByNumber.get(sb.counter_account_number);
            if (ca) {
              sb.counter_account_id = ca.id;
              sb.counter_account_name = sb.counter_account_name || ca.account_name;
            }
          }

          // Validierungen
          if (!sb.booking_type) {
            validationWarnings.push(`Buchung ohne booking_type verworfen: ${sb.description}`);
            return null;
          }
          if (!sb.counter_account_id) {
            validationWarnings.push(`Counter-Account ${sb.counter_account_number} nicht im Kontenrahmen: ${sb.description}`);
            return null;
          }
          if (sb.account_id === sb.counter_account_id) {
            validationWarnings.push(`account_id == counter_account_id verworfen: ${sb.description}`);
            return null;
          }
          if (sb.amount <= 0) {
            sb.amount = Math.abs(sb.amount);
          }
          // §35a Plausibilität
          if (sb.is_35a_relevant && sb.amount_35a && sb.amount_35a > sb.amount) {
            sb.amount_35a = sb.amount;
            validationWarnings.push(`amount_35a > amount korrigiert: ${sb.description}`);
          }
          return sb;
        })
        .filter(Boolean);
    }

    if (validationWarnings.length > 0) {
      console.warn("Validation warnings:", validationWarnings);
      parsed._validation_warnings = validationWarnings;
    }

    // RAG-Metadata anhängen
    parsed._rag_meta = {
      similar_count: ragSimilar.length,
      cross_building_count: ragOtherBuildings.length,
      vendor_memory_count: ragVendorMemory.length,
      embedding_used: queryEmbedding !== null,
    };

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-match error:", e);
    return new Response(
      JSON.stringify({ matches: [], error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
