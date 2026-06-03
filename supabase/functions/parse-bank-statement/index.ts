import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function stripNamespaces(xml: string): string {
  let cleaned = xml.replace(/\sxmlns(:[a-zA-Z0-9]+)?="[^"]*"/g, "");
  cleaned = cleaned.replace(/<\/?[a-zA-Z0-9]+:/g, (match) => {
    return match.startsWith("</") ? "</" : "<";
  });
  return cleaned;
}

function getTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function getAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  return xml.match(re) || [];
}

async function computeHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseEntries(stmt: string, buildingId: string | null, statementId: string) {
  const entries = getAllTags(stmt, "Ntry");
  const transactions: any[] = [];

  for (const entry of entries) {
    const amtMatch = entry.match(/<Amt[^>]*>([\d.,]+)<\/Amt>/i);
    const amount = amtMatch ? parseFloat(amtMatch[1].replace(",", ".")) : 0;
    const currency = entry.match(/<Amt[^>]*Ccy="([^"]+)"/i)?.[1] || "EUR";

    const cdtDbtInd = getTag(entry, "CdtDbtInd");
    const signedAmount = cdtDbtInd === "DBIT" ? -Math.abs(amount) : Math.abs(amount);

    const bookingDate = getTag(getTag(entry, "BookgDt"), "Dt");
    const valueDate = getTag(getTag(entry, "ValDt"), "Dt");

    const ntryDtls = getTag(entry, "NtryDtls");
    const txDtls = getTag(ntryDtls, "TxDtls") || ntryDtls;

    const rmtInf = getTag(txDtls, "RmtInf") || getTag(entry, "RmtInf");
    const purpose = getTag(rmtInf, "Ustrd") || getTag(entry, "AddtlNtryInf") || "";

    const refs = getTag(txDtls, "Refs");
    const e2eMatch = refs.match(/<EndToEndId>([^<]*)<\/EndToEndId>/i);
    const e2e = e2eMatch ? e2eMatch[1] : null;

    const rltdPties = getTag(txDtls, "RltdPties");
    const dbtr = getTag(rltdPties, "Dbtr");
    const cdtr = getTag(rltdPties, "Cdtr");
    const dbtrAcct = getTag(getTag(rltdPties, "DbtrAcct"), "Id");
    const cdtrAcct = getTag(getTag(rltdPties, "CdtrAcct"), "Id");

    transactions.push({
      statement_id: statementId,
      building_id: buildingId || null,
      booking_date: bookingDate || new Date().toISOString().substring(0, 10),
      value_date: valueDate || null,
      amount: signedAmount,
      currency,
      debtor_name: getTag(dbtr, "Nm") || null,
      debtor_iban: getTag(dbtrAcct, "IBAN") || null,
      creditor_name: getTag(cdtr, "Nm") || null,
      creditor_iban: getTag(cdtrAcct, "IBAN") || null,
      purpose: purpose || null,
      end_to_end_ref: e2e,
      match_status: "unmatched",
    });
  }

  return transactions;
}

async function addHashes(transactions: any[]): Promise<any[]> {
  for (const txn of transactions) {
    const raw = `${txn.booking_date}|${txn.amount}|${txn.creditor_iban || ""}|${txn.debtor_iban || ""}|${txn.purpose || ""}|${txn.end_to_end_ref || ""}`;
    txn.transaction_hash = await computeHash(raw);
  }
  return transactions;
}

async function deduplicateTransactions(supabase: any, transactions: any[]): Promise<{ unique: any[]; duplicateCount: number }> {
  if (transactions.length === 0) return { unique: [], duplicateCount: 0 };

  const hashes = transactions.map((t) => t.transaction_hash);
  
  // Check in batches of 100
  const existingHashes = new Set<string>();
  for (let i = 0; i < hashes.length; i += 100) {
    const batch = hashes.slice(i, i + 100);
    const { data } = await supabase
      .from("bank_transactions")
      .select("transaction_hash")
      .in("transaction_hash", batch);
    if (data) {
      data.forEach((r: any) => existingHashes.add(r.transaction_hash));
    }
  }

  const unique = transactions.filter((t) => !existingHashes.has(t.transaction_hash));
  return { unique, duplicateCount: transactions.length - unique.length };
}

async function matchTransactions(supabase: any, statementId: string, buildingId: string | null) {
  const { data: savedTxns } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("statement_id", statementId);

  if (!savedTxns || savedTxns.length === 0) return { matched: 0, total: 0 };

  // Only match against building-specific invoices and templates
  let invoicesQuery = supabase
    .from("invoices")
    .select("id, vendor_iban, gross_amount, invoice_number")
    .eq("status", "paid");
  if (buildingId) invoicesQuery = invoicesQuery.eq("building_id", buildingId);
  const { data: paidInvoices } = await invoicesQuery;

  let templatesQuery = supabase
    .from("booking_templates")
    .select("id, vendor_iban, vendor_name, expected_amount, amount_tolerance, valid_from, valid_to");
  if (buildingId) templatesQuery = templatesQuery.eq("building_id", buildingId);
  const { data: templates } = await templatesQuery;

  let matchedCount = 0;

  // Helper: normalize purpose for invoice number search (case-insensitive, strip spaces/dashes/slashes)
  const normalize = (s: string) => (s || "").toLowerCase().replace(/[\s\-\/.]/g, "");

  for (const txn of savedTxns) {
    const txnAbs = Math.abs(txn.amount);
    const txnIban = txn.amount < 0 ? txn.creditor_iban : txn.debtor_iban;
    const purposeNorm = normalize(txn.purpose || "");

    if (paidInvoices) {
      let invoiceMatch = null;

      // Tier 1: IBAN + amount + invoice number contained in purpose (strongest match)
      if (txnIban && purposeNorm) {
        invoiceMatch = paidInvoices.find(
          (inv: any) =>
            inv.vendor_iban &&
            inv.vendor_iban.replace(/\s/g, "").toUpperCase() ===
              txnIban.replace(/\s/g, "").toUpperCase() &&
            inv.gross_amount &&
            Math.abs(inv.gross_amount - txnAbs) <= 0.01 &&
            inv.invoice_number &&
            String(inv.invoice_number).length >= 3 &&
            purposeNorm.includes(normalize(String(inv.invoice_number)))
        );
      }

      // Tier 2: IBAN + amount – aber NUR wenn eindeutig (genau ein Kandidat).
      // Gibt es mehrere Rechnungen desselben Lieferanten mit identischem Betrag,
      // muss die Rechnungsnummer im Verwendungszweck stehen (Tier 1), sonst
      // wird nichts zugewiesen, um Fehlzuordnungen zu vermeiden.
      if (!invoiceMatch && txnIban) {
        const candidates = paidInvoices.filter(
          (inv: any) =>
            inv.vendor_iban &&
            inv.vendor_iban.replace(/\s/g, "").toUpperCase() ===
              txnIban.replace(/\s/g, "").toUpperCase() &&
            inv.gross_amount &&
            Math.abs(inv.gross_amount - txnAbs) <= 0.01,
        );
        if (candidates.length === 1) {
          const cand = candidates[0];
          // Wenn eine Rechnungsnummer existiert UND im Purpose eine andere
          // erkennbare Nummer steht, lieber NICHT matchen (siehe Tier 1).
          // Hier (eindeutiger Kandidat) übernehmen wir es trotzdem.
          invoiceMatch = cand;
        }
      }

      // Tier 3: Invoice number + amount (kein IBAN-Treffer nötig, aber Nummer muss exakt passen)
      if (!invoiceMatch && purposeNorm) {
        const candidates = paidInvoices.filter(
          (inv: any) =>
            inv.invoice_number &&
            String(inv.invoice_number).length >= 3 &&
            purposeNorm.includes(normalize(String(inv.invoice_number))) &&
            inv.gross_amount &&
            Math.abs(inv.gross_amount - txnAbs) <= 0.01,
        );
        if (candidates.length === 1) invoiceMatch = candidates[0];
      }

      if (invoiceMatch) {
        await supabase
          .from("bank_transactions")
          .update({ match_status: "matched_invoice", matched_invoice_id: invoiceMatch.id })
          .eq("id", txn.id);
        matchedCount++;
        continue;
      }
    }


    if (templates) {
      const txnDateStr = (txn.booking_date || "").slice(0, 10);
      const templateMatch = templates.find((t: any) => {
        // Time-based validity: only match if txn date is within valid_from/valid_to
        if (txnDateStr) {
          if (t.valid_from && txnDateStr < String(t.valid_from).slice(0, 10)) return false;
          if (t.valid_to && txnDateStr > String(t.valid_to).slice(0, 10)) return false;
        }
        // Amount tolerance check (if expected_amount set)
        if (t.expected_amount != null) {
          const tol = Number(t.amount_tolerance) || 0;
          if (Math.abs(txnAbs - Math.abs(Number(t.expected_amount))) > tol + 0.01) return false;
        }
        if (t.vendor_iban && txnIban) {
          return t.vendor_iban.replace(/\s/g, "").toUpperCase() === txnIban.replace(/\s/g, "").toUpperCase();
        }
        if (t.vendor_name && txn.purpose) {
          return txn.purpose.toLowerCase().includes(t.vendor_name.toLowerCase());
        }
        return false;
      });

      if (templateMatch) {
        await supabase
          .from("bank_transactions")
          .update({ match_status: "matched_template", matched_template_id: templateMatch.id })
          .eq("id", txn.id);
        matchedCount++;
        continue;
      }
    }
  }

  return { matched: matchedCount, total: savedTxns.length };
}

async function syncReconciliation(
  supabase: any, buildingId: string, statementId: string, iban: string | null,
  dateTo: string | null, opening: number | null, closing: number | null,
  source: "pdf_import" | "camt_import",
): Promise<void> {
  if (!buildingId || !dateTo || (opening == null && closing == null)) return;
  let bankAccountId: string | null = null;
  if (iban) {
    const { data: coa } = await supabase
      .from("chart_of_accounts").select("id, iban")
      .or(`building_id.is.null,building_id.eq.${buildingId}`)
      .or(`iban.eq.${iban}`).limit(1);
    if (coa?.length) bankAccountId = coa[0].id;
  }
  if (!bankAccountId) {
    const { data: coa } = await supabase
      .from("chart_of_accounts").select("id, account_number, account_name")
      .or("account_number.like.18%,account_number.like.10%")
      .or(`building_id.is.null,building_id.eq.${buildingId}`);
    const bank = (coa || []).find((a: any) => /bank|giro|tagesgeld/i.test(a.account_name || ""));
    if (bank) bankAccountId = bank.id;
  }
  if (!bankAccountId) return;
  const d = new Date(dateTo);
  const year = d.getFullYear(); const month = d.getMonth() + 1;
  const { data: existing } = await supabase
    .from("bank_reconciliations").select("id, closing_balance_bank, bank_source")
    .eq("building_id", buildingId).eq("bank_account_id", bankAccountId)
    .eq("period_year", year).eq("period_month", month).maybeSingle();
  if (existing && existing.closing_balance_bank != null && existing.bank_source !== source && existing.bank_source !== null) return;
  await supabase.from("bank_reconciliations").upsert({
    building_id: buildingId, bank_account_id: bankAccountId,
    period_year: year, period_month: month,
    opening_balance_bank: opening, closing_balance_bank: closing,
    bank_source: source, source_statement_id: statementId, status: "open",
  }, { onConflict: "building_id,bank_account_id,period_year,period_month" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader || "" } } }
    );
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { xmlContent, buildingId, rematchBuildingId, fiscalYear } = await req.json();

    // Re-match mode: run matching on all unmatched transactions for a building
    if (rematchBuildingId) {
      const { data: unmatched } = await supabase
        .from("bank_transactions")
        .select("id, statement_id")
        .eq("building_id", rematchBuildingId)
        .eq("match_status", "unmatched")
        .is("booked_at", null);

      if (!unmatched?.length) {
        return new Response(
          JSON.stringify({ success: true, matched: 0, total: 0, message: "Keine offenen Transaktionen." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get unique statement IDs
      const stmtIds = [...new Set(unmatched.map((t: any) => t.statement_id))];
      let totalMatched = 0;
      for (const sid of stmtIds) {
        const result = await matchTransactions(supabase, sid, rematchBuildingId);
        totalMatched += result.matched;
      }

      return new Response(
        JSON.stringify({ success: true, matched: totalMatched, total: unmatched.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!xmlContent) {
      return new Response(JSON.stringify({ error: "xmlContent required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanXml = stripNamespaces(xmlContent);

    let stmt = getTag(cleanXml, "Stmt");
    if (!stmt) stmt = getTag(cleanXml, "Rpt");
    if (!stmt) stmt = cleanXml;

    console.log("XML length:", cleanXml.length, "Stmt/Rpt length:", stmt.length);

    const accountIban = getTag(getTag(getTag(stmt, "Acct"), "Id"), "IBAN");
    const accountName = getTag(getTag(stmt, "Acct"), "Nm");

    const frToDt = getTag(stmt, "FrToDt");
    const frDt = getTag(getTag(frToDt, "FrDtTm"), "").substring(0, 10) ||
                 getTag(frToDt, "FrDt") || null;
    const toDt = getTag(getTag(frToDt, "ToDtTm"), "").substring(0, 10) ||
                 getTag(frToDt, "ToDt") || null;

    // CAMT-Salden extrahieren: Bal-Blöcke mit OPBD (opening) / CLBD (closing)
    const balanceBlocks = getAllTags(stmt, "Bal");
    let openingBalance: number | null = null;
    let closingBalance: number | null = null;
    for (const bal of balanceBlocks) {
      const code = getTag(getTag(getTag(bal, "Tp"), "CdOrPrtry"), "Cd");
      const amtMatch = bal.match(/<Amt[^>]*>([\d.,]+)<\/Amt>/i);
      if (!amtMatch) continue;
      const raw = parseFloat(amtMatch[1].replace(/\./g, "").replace(",", "."));
      const sign = getTag(bal, "CdtDbtInd") === "DBIT" ? -1 : 1;
      const value = sign * (isNaN(raw) ? 0 : raw);
      if ((code === "OPBD" || code === "PRCD") && openingBalance == null) openingBalance = value;
      if (code === "CLBD") closingBalance = value;
    }

    // Create bank statement record
    const { data: statement, error: stmtError } = await supabase
      .from("bank_statements")
      .insert({
        building_id: buildingId || null,
        file_name: "CAMT XML Import",
        account_iban: accountIban || null,
        account_name: accountName || null,
        statement_date_from: frDt,
        statement_date_to: toDt,
        opening_balance: openingBalance,
        closing_balance: closingBalance,
        source_format: "camt_xml",
        created_by: user.id,
      })
      .select()
      .single();

    if (stmtError) throw stmtError;

    // Parse entries and compute hashes
    let transactions = parseEntries(stmt, buildingId, statement.id);
    transactions = await addHashes(transactions);
    console.log("Parsed", transactions.length, "transactions from XML");

    // Deduplicate
    const { unique, duplicateCount } = await deduplicateTransactions(supabase, transactions);
    console.log("Unique:", unique.length, "Duplicates skipped:", duplicateCount);

    // Insert unique transactions
    if (unique.length > 0) {
      const { error: txError } = await supabase
        .from("bank_transactions")
        .insert(unique);
      if (txError) throw txError;
    }

    // If no unique transactions were imported, delete the empty statement
    if (unique.length === 0 && duplicateCount > 0) {
      await supabase.from("bank_statements").delete().eq("id", statement.id);
      return new Response(
        JSON.stringify({
          success: true,
          statementId: null,
          totalTransactions: 0,
          duplicatesSkipped: duplicateCount,
          matchedCount: 0,
          unmatchedCount: 0,
          message: `Alle ${duplicateCount} Transaktionen waren bereits importiert.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Matching phase
    const matchResult = unique.length > 0
      ? await matchTransactions(supabase, statement.id, buildingId || null)
      : { matched: 0, total: 0 };

    // Saldo-Sync in Kostenabgleich
    if (buildingId && (openingBalance != null || closingBalance != null)) {
      try {
        await syncReconciliation(
          supabase, buildingId, statement.id, accountIban || null,
          toDt, openingBalance, closingBalance, "camt_import",
        );
      } catch (e) { console.warn("recon sync failed:", e); }
    }

    return new Response(
      JSON.stringify({
        success: true,
        statementId: statement.id,
        totalTransactions: unique.length,
        duplicatesSkipped: duplicateCount,
        matchedCount: matchResult.matched,
        unmatchedCount: unique.length - matchResult.matched,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("parse-bank-statement error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
