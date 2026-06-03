import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function parseGermanAmount(value: any): number | null {
  if (value == null) return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  let s = String(value).trim();
  if (!s) return null;
  const negative = s.startsWith("-") || /S$/i.test(s) || /\bSoll\b/i.test(s);
  s = s.replace(/[€EUR\s]/gi, "").replace(/[+SH]$/i, "").replace(/^-/, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) s = s.replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function normalizeIban(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/\s+/g, "").toUpperCase();
}

async function computeHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ----------------------------------------------------------------------------
// Mistral OCR + Structured extraction
// ----------------------------------------------------------------------------

async function mistralOcr(base64Pdf: string, apiKey: string): Promise<string> {
  const resp = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: { type: "document_url", document_url: `data:application/pdf;base64,${base64Pdf}` },
      include_image_base64: false,
    }),
  });
  if (!resp.ok) throw new Error(`OCR failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  const pages: any[] = data?.pages || [];
  return pages.map((p) => p.markdown || "").join("\n\n---PAGE---\n\n");
}

async function extractStructuredStatement(markdown: string, apiKey: string): Promise<any> {
  const systemPrompt = `Du extrahierst Daten aus deutschen Bank-Kontoauszügen (PDF).

ABSOLUTE REGELN:
- Erfinde NIE Werte. Wenn ein Feld fehlt, gib null zurück.
- Beträge IMMER als deutsche Zahl mit Komma als Dezimaltrenner.
- Soll/Lastschrift/DBIT/Belastung = NEGATIVER Betrag (Vorzeichen "-").
- Haben/Gutschrift/CRDT/Eingang = POSITIVER Betrag.
- Abschlag, Lastschrift, Dauerauftrag, Überweisung an = IMMER negativ.
- Eingang, Gutschrift, Erstattung = IMMER positiv.
- Datum im Format YYYY-MM-DD.
- IBAN ohne Leerzeichen, GROSSBUCHSTABEN.
- Anfangssaldo = Startsaldo / Saldo Vortrag / Alter Saldo / Saldo am ...
- Endsaldo = Endsaldo / Neuer Saldo / Schlusssaldo.

KRITISCHE BLOCK-REGEL (gegen Verwechslung von Empfängern):
Jede Transaktion ist EIN ZUSAMMENHÄNGENDER BLOCK. Jeder Block enthält:
  Zeile 1: Empfängername (oder Auftraggeber bei Eingang)
  Zeile 2: IBAN des Gegenkontos
  Zeile 3+: Verwendungszweck (mehrzeilig, mit EREF/MREF/CRED-Refs)
  Spalte rechts: Betrag und Buchungsdatum
NIEMALS Felder aus Block A mit Feldern aus Block B kombinieren.
NIEMALS einen Empfängernamen aus dem darüberliegenden Block für eine andere Buchung übernehmen.
Wenn ein Block unvollständig erscheint (z. B. nur Empfänger, kein Betrag) → diese Zeile NICHT zu einer Transaktion machen, sondern überspringen.

VOLLSTÄNDIGKEIT:
- Liste ALLE sichtbaren Buchungen vollständig auf — auch "Abschluss"-Zeilen, Gebühren und kleine Beträge (≤1 €).
- Prüfe am Ende: Summe(Beträge) MUSS exakt = Endsaldo - Anfangssaldo. Wenn nicht, fehlt eine Buchung oder ein Vorzeichen ist falsch — korrigiere.`;

  const userPrompt = `Extrahiere die strukturierten Daten aus diesem Kontoauszug:\n\n${markdown.slice(0, 60000)}`;

  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral-medium-3-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  if (!resp.ok) throw new Error(`Mistral chat failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from Mistral");

  // We ask in user-prompt suffix for a specific JSON shape:
  return JSON.parse(content);
}

const STRUCTURE_HINT = `

Antworte als JSON mit genau dieser Struktur:
{
  "account_iban": "DEXX...",          // oder null
  "account_name": "Kontoinhaber",      // oder null
  "bic": "GENODEF1AUB",                // oder null
  "statement_date_from": "2025-01-01", // oder null
  "statement_date_to": "2025-01-31",
  "currency": "EUR",
  "opening_balance": "13.220,66",      // String mit deutschem Komma, oder null
  "closing_balance": "13.210,32",
  "transactions": [
    {
      "booking_date": "2025-01-31",
      "value_date": "2025-01-31",       // oder null
      "amount": "-10,34",                // signiert (DBIT = -)
      "purpose": "Abschluss",
      "counterparty_name": null,
      "counterparty_iban": null,
      "end_to_end_ref": null
    }
  ]
}
NICHTS anderes ausgeben — nur dieses JSON-Objekt.`;

// ----------------------------------------------------------------------------
// Matching (kopiert aus parse-bank-statement)
// ----------------------------------------------------------------------------

async function matchTransactions(supabase: any, statementId: string, buildingId: string | null) {
  const { data: savedTxns } = await supabase
    .from("bank_transactions").select("*").eq("statement_id", statementId);
  if (!savedTxns?.length) return { matched: 0, total: 0 };

  let invQ = supabase.from("invoices")
    .select("id, vendor_iban, gross_amount, invoice_number").eq("status", "paid");
  if (buildingId) invQ = invQ.eq("building_id", buildingId);
  const { data: paidInvoices } = await invQ;

  let tplQ = supabase.from("booking_templates")
    .select("id, vendor_iban, vendor_name, expected_amount, amount_tolerance, valid_from, valid_to");
  if (buildingId) tplQ = tplQ.eq("building_id", buildingId);
  const { data: templates } = await tplQ;

  let matched = 0;
  for (const txn of savedTxns) {
    const txnAbs = Math.abs(Number(txn.amount));
    const txnIban = txn.amount < 0 ? txn.creditor_iban : txn.debtor_iban;

    if (paidInvoices) {
      let invMatch: any = null;
      if (txnIban && txn.purpose) {
        invMatch = paidInvoices.find((i: any) =>
          i.vendor_iban && normalizeIban(i.vendor_iban) === normalizeIban(txnIban) &&
          i.gross_amount && Math.abs(i.gross_amount - txnAbs) <= 0.01 &&
          i.invoice_number && txn.purpose.includes(i.invoice_number));
      }
      if (!invMatch && txnIban) {
        invMatch = paidInvoices.find((i: any) =>
          i.vendor_iban && normalizeIban(i.vendor_iban) === normalizeIban(txnIban) &&
          i.gross_amount && Math.abs(i.gross_amount - txnAbs) <= 0.01);
      }
      if (invMatch) {
        await supabase.from("bank_transactions")
          .update({ match_status: "matched_invoice", matched_invoice_id: invMatch.id })
          .eq("id", txn.id);
        matched++;
        continue;
      }
    }

    if (templates) {
      const txnDate = (txn.booking_date || "").slice(0, 10);
      const tpl = templates.find((t: any) => {
        if (txnDate) {
          if (t.valid_from && txnDate < String(t.valid_from).slice(0, 10)) return false;
          if (t.valid_to && txnDate > String(t.valid_to).slice(0, 10)) return false;
        }
        if (t.expected_amount != null) {
          const tol = Number(t.amount_tolerance) || 0;
          if (Math.abs(txnAbs - Math.abs(Number(t.expected_amount))) > tol + 0.01) return false;
        }
        if (t.vendor_iban && txnIban) return normalizeIban(t.vendor_iban) === normalizeIban(txnIban);
        if (t.vendor_name && txn.purpose) return txn.purpose.toLowerCase().includes(t.vendor_name.toLowerCase());
        return false;
      });
      if (tpl) {
        await supabase.from("bank_transactions")
          .update({ match_status: "matched_template", matched_template_id: tpl.id })
          .eq("id", txn.id);
        matched++;
      }
    }
  }
  return { matched, total: savedTxns.length };
}

// ----------------------------------------------------------------------------
// Bank-Reconciliation Sync (Anfangs-/Endbestand → Kostenabgleich)
// ----------------------------------------------------------------------------

async function syncReconciliation(
  supabase: any,
  buildingId: string,
  statementId: string,
  iban: string | null,
  dateFrom: string | null,
  dateTo: string | null,
  opening: number | null,
  closing: number | null,
  source: "pdf_import" | "camt_import",
): Promise<string[]> {
  const warnings: string[] = [];
  if (!buildingId || !dateTo || (opening == null && closing == null)) return warnings;

  // Bank-Konto via IBAN finden (chart_of_accounts.iban-Mapping ggf. nicht vorhanden → fallback per Name)
  let bankAccountId: string | null = null;
  if (iban) {
    const { data: coa } = await supabase
      .from("chart_of_accounts")
      .select("id, account_name, iban")
      .or(`building_id.is.null,building_id.eq.${buildingId}`)
      .or(`iban.eq.${iban}`)
      .limit(1);
    if (coa?.length) bankAccountId = coa[0].id;
  }
  if (!bankAccountId) {
    // Fallback: erstes Bankkonto der Liegenschaft (1800/1000-Bereich)
    const { data: coa } = await supabase
      .from("chart_of_accounts")
      .select("id, account_number, account_name")
      .or("account_number.like.18%,account_number.like.10%")
      .or(`building_id.is.null,building_id.eq.${buildingId}`);
    const bank = (coa || []).find((a: any) =>
      /bank|giro|tagesgeld/i.test(a.account_name || ""));
    if (bank) bankAccountId = bank.id;
  }
  if (!bankAccountId) {
    warnings.push("Kein Bankkonto im Kontenplan gefunden — Anfangs-/Endbestand nicht in den Kostenabgleich übernommen.");
    return warnings;
  }

  const d = new Date(dateTo);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  // Existierenden Eintrag prüfen — manuelle Werte NICHT überschreiben
  const { data: existing } = await supabase
    .from("bank_reconciliations")
    .select("id, opening_balance_bank, closing_balance_bank, bank_source")
    .eq("building_id", buildingId)
    .eq("bank_account_id", bankAccountId)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (existing && existing.bank_source !== source && existing.bank_source !== null) {
    // Manueller Eintrag oder anderer Importtyp → respektieren
    if (existing.closing_balance_bank != null) {
      warnings.push(`Manueller Saldo für ${month}/${year} bleibt erhalten — kein Überschreiben.`);
      return warnings;
    }
  }

  const payload: any = {
    building_id: buildingId,
    bank_account_id: bankAccountId,
    period_year: year,
    period_month: month,
    opening_balance_bank: opening,
    closing_balance_bank: closing,
    bank_source: source,
    source_statement_id: statementId,
    status: "open",
  };

  const { error } = await supabase
    .from("bank_reconciliations")
    .upsert(payload, { onConflict: "building_id,bank_account_id,period_year,period_month" });
  if (error) warnings.push(`Saldo-Sync fehlgeschlagen: ${error.message}`);
  return warnings;
}

// ----------------------------------------------------------------------------
// Main handler
// ----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader || "" } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("MISTRAL_API_KEY");
    if (!apiKey) throw new Error("MISTRAL_API_KEY nicht konfiguriert");

    const { pdfBase64, fileName, buildingId, fiscalYear } = await req.json();
    if (!pdfBase64 || !fileName) {
      return new Response(JSON.stringify({ error: "pdfBase64 und fileName erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) OCR
    console.log(`[pdf-import] OCR ${fileName}`);
    const markdown = await mistralOcr(pdfBase64, apiKey);

    // 2) Structured extraction (mit Hint angehängt)
    console.log(`[pdf-import] Structured extraction (md length: ${markdown.length})`);
    const extracted = await extractStructuredStatement(markdown + STRUCTURE_HINT, apiKey);
    console.log(`[pdf-import] Extracted: iban=${extracted.account_iban}, opening=${extracted.opening_balance}, closing=${extracted.closing_balance}, txns=${extracted.transactions?.length || 0}`);

    const warnings: string[] = [];
    const opening = parseGermanAmount(extracted.opening_balance);
    const closing = parseGermanAmount(extracted.closing_balance);
    const iban = normalizeIban(extracted.account_iban);

    if (!iban) warnings.push("IBAN nicht erkannt.");
    if (opening == null) warnings.push("Anfangssaldo nicht erkannt.");
    if (closing == null) warnings.push("Endsaldo nicht erkannt.");

    // Sanity-Check: Summe der Transaktionen ≈ closing - opening
    const txns = Array.isArray(extracted.transactions) ? extracted.transactions : [];
    if (opening != null && closing != null && txns.length > 0) {
      const sum = txns.reduce((s: number, t: any) => s + (parseGermanAmount(t.amount) ?? 0), 0);
      const expected = closing - opening;
      if (Math.abs(sum - expected) > 0.02) {
        warnings.push(`Summenprüfung: Σ Transaktionen ${sum.toFixed(2)} € ≠ Differenz ${expected.toFixed(2)} € (Δ ${(sum - expected).toFixed(2)} €).`);
      }
    }

    // 3) PDF in Storage ablegen
    const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
    const safeName = fileName.replace(/[^\w.\-]/g, "_");
    const storagePath = `bank-statements/${buildingId || "no-building"}/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage.from("building-documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) {
      console.error("storage upload error:", upErr);
      warnings.push(`Original-PDF konnte nicht gespeichert werden: ${upErr.message}`);
    }

    // 4) bank_statements Record
    const { data: statement, error: stmtErr } = await supabase.from("bank_statements").insert({
      building_id: buildingId || null,
      file_name: fileName,
      file_path: upErr ? null : storagePath,
      account_iban: iban,
      account_name: extracted.account_name || null,
      statement_date_from: extracted.statement_date_from || null,
      statement_date_to: extracted.statement_date_to || null,
      opening_balance: opening,
      closing_balance: closing,
      source_format: "pdf",
      parse_warnings: warnings.length ? warnings : null,
      fiscal_year: Number(fiscalYear) || (extracted.statement_date_to ? new Date(extracted.statement_date_to).getFullYear() : new Date().getFullYear()),
      created_by: user.id,
    }).select().single();
    if (stmtErr) throw stmtErr;

    // 5) Transaktionen normalisieren
    const txnRows = [];
    for (const t of txns) {
      const amount = parseGermanAmount(t.amount);
      if (amount == null) continue;
      const bookingDate = t.booking_date || extracted.statement_date_to || new Date().toISOString().slice(0, 10);
      const purpose = (t.purpose || "").toString().trim();
      const cpIban = normalizeIban(t.counterparty_iban);
      const cpName = t.counterparty_name || null;
      const e2e = t.end_to_end_ref || null;

      const hashRaw = `${bookingDate}|${amount}|${amount < 0 ? cpIban || "" : ""}|${amount > 0 ? cpIban || "" : ""}|${purpose}|${e2e || ""}`;
      const hash = await computeHash(hashRaw);

      txnRows.push({
        statement_id: statement.id,
        building_id: buildingId || null,
        booking_date: bookingDate,
        value_date: t.value_date || null,
        amount,
        currency: extracted.currency || "EUR",
        debtor_name: amount > 0 ? cpName : null,
        debtor_iban: amount > 0 ? cpIban : null,
        creditor_name: amount < 0 ? cpName : null,
        creditor_iban: amount < 0 ? cpIban : null,
        purpose: purpose || null,
        end_to_end_ref: e2e,
        match_status: "unmatched",
        transaction_hash: hash,
      });
    }

    // 6) Dedup
    let inserted = 0, duplicates = 0;
    if (txnRows.length) {
      const hashes = txnRows.map((t) => t.transaction_hash);
      const existing = new Set<string>();
      for (let i = 0; i < hashes.length; i += 100) {
        const batch = hashes.slice(i, i + 100);
        const { data } = await supabase.from("bank_transactions")
          .select("transaction_hash").in("transaction_hash", batch);
        data?.forEach((r: any) => existing.add(r.transaction_hash));
      }
      const unique = txnRows.filter((t) => !existing.has(t.transaction_hash));
      duplicates = txnRows.length - unique.length;
      if (unique.length) {
        const { error } = await supabase.from("bank_transactions").insert(unique);
        if (error) throw error;
        inserted = unique.length;
      }
    }

    // 7) Matching
    const matchResult = inserted > 0
      ? await matchTransactions(supabase, statement.id, buildingId || null)
      : { matched: 0, total: 0 };

    // 8) Saldo-Sync in Kostenabgleich
    if (buildingId && (opening != null || closing != null)) {
      const syncWarn = await syncReconciliation(
        supabase, buildingId, statement.id, iban,
        extracted.statement_date_from || null,
        extracted.statement_date_to || null,
        opening, closing, "pdf_import",
      );
      if (syncWarn.length) {
        const merged = [...warnings, ...syncWarn];
        await supabase.from("bank_statements")
          .update({ parse_warnings: merged })
          .eq("id", statement.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      statementId: statement.id,
      totalTransactions: inserted,
      duplicatesSkipped: duplicates,
      matchedCount: matchResult.matched,
      unmatchedCount: inserted - matchResult.matched,
      openingBalance: opening,
      closingBalance: closing,
      iban,
      warnings,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("parse-bank-statement-pdf error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
