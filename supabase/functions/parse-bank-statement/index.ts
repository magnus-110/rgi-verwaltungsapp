import { createClient } from "npm:@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Get user from token
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

    const { xmlContent, buildingId } = await req.json();
    if (!xmlContent) {
      return new Response(JSON.stringify({ error: "xmlContent required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Simple XML parser helpers
    const getTag = (xml: string, tag: string): string => {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
      const m = xml.match(re);
      return m ? m[1].trim() : "";
    };

    const getAllTags = (xml: string, tag: string): string[] => {
      const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
      return xml.match(re) || [];
    };

    // Parse CAMT.053 structure
    const stmt = getTag(xmlContent, "Stmt");
    const accountIban = getTag(getTag(getTag(stmt, "Acct"), "Id"), "IBAN");
    const frDt = getTag(getTag(getTag(stmt, "Bal"), "Dt"), "Dt") || null;

    // Extract statement period from FrToDt if available
    const frToDt = getTag(stmt, "FrToDt");
    const stmtDateFrom = getTag(frToDt, "FrDtTm")?.substring(0, 10) || frDt || null;
    const stmtDateTo = getTag(frToDt, "ToDtTm")?.substring(0, 10) || null;

    // Create bank statement record
    const { data: statement, error: stmtError } = await supabase
      .from("bank_statements")
      .insert({
        building_id: buildingId || null,
        file_name: "CAMT.053 Import",
        account_iban: accountIban || null,
        statement_date_from: stmtDateFrom,
        statement_date_to: stmtDateTo,
        created_by: user.id,
      })
      .select()
      .single();

    if (stmtError) throw stmtError;

    // Parse entries (Ntry)
    const entries = getAllTags(stmt, "Ntry");
    const transactions: any[] = [];

    for (const entry of entries) {
      const amountStr = getTag(getTag(entry, "Amt"), "") || getTag(entry, "Amt");
      // Get amount from Amt tag - handle attribute-based format
      const amtMatch = entry.match(/<Amt[^>]*>([\d.,]+)<\/Amt>/i);
      const amount = amtMatch ? parseFloat(amtMatch[1].replace(",", ".")) : 0;
      const currency = entry.match(/<Amt[^>]*Ccy="([^"]+)"/i)?.[1] || "EUR";

      // Credit/Debit indicator
      const cdtDbtInd = getTag(entry, "CdtDbtInd");
      const signedAmount = cdtDbtInd === "DBIT" ? -Math.abs(amount) : Math.abs(amount);

      const bookingDate = getTag(getTag(entry, "BookgDt"), "Dt");
      const valueDate = getTag(getTag(entry, "ValDt"), "Dt");

      // Transaction details
      const txDtls = getTag(getTag(entry, "NtryDtls"), "TxDtls");
      const purpose = getTag(getTag(txDtls, "RmtInf"), "Ustrd");
      const endToEndRef = getTag(getTag(getTag(txDtls, "Refs"), "EndToEndId"), "") || getTag(getTag(txDtls, "Refs"), "EndToEndId");
      const e2eMatch = txDtls.match(/<EndToEndId>([^<]*)<\/EndToEndId>/i);
      const e2e = e2eMatch ? e2eMatch[1] : null;

      // Related parties
      const rltdPties = getTag(txDtls, "RltdPties");
      const dbtr = getTag(rltdPties, "Dbtr");
      const cdtr = getTag(rltdPties, "Cdtr");
      const dbtrAcct = getTag(getTag(rltdPties, "DbtrAcct"), "Id");
      const cdtrAcct = getTag(getTag(rltdPties, "CdtrAcct"), "Id");

      transactions.push({
        statement_id: statement.id,
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

    // Insert all transactions
    if (transactions.length > 0) {
      const { error: txError } = await supabase
        .from("bank_transactions")
        .insert(transactions);
      if (txError) throw txError;
    }

    // --- Matching Phase ---
    // Reload transactions with IDs
    const { data: savedTxns } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("statement_id", statement.id);

    if (savedTxns && savedTxns.length > 0) {
      // Load paid invoices
      const { data: paidInvoices } = await supabase
        .from("invoices")
        .select("id, vendor_iban, gross_amount")
        .eq("status", "paid");

      // Load booking templates
      const { data: templates } = await supabase
        .from("booking_templates")
        .select("id, vendor_iban, vendor_name, expected_amount");

      let matchedCount = 0;

      for (const txn of savedTxns) {
        // Only match outgoing (negative) amounts against invoices
        const txnAbs = Math.abs(txn.amount);
        const txnIban = txn.amount < 0 ? txn.creditor_iban : txn.debtor_iban;

        // Step 1: Match against paid invoices
        if (paidInvoices && txnIban) {
          const invoiceMatch = paidInvoices.find(
            (inv) =>
              inv.vendor_iban &&
              inv.vendor_iban.replace(/\s/g, "").toUpperCase() ===
                txnIban.replace(/\s/g, "").toUpperCase() &&
              inv.gross_amount &&
              Math.abs(inv.gross_amount - txnAbs) <= 0.01
          );

          if (invoiceMatch) {
            await supabase
              .from("bank_transactions")
              .update({
                match_status: "matched_invoice",
                matched_invoice_id: invoiceMatch.id,
              })
              .eq("id", txn.id);
            matchedCount++;
            continue;
          }
        }

        // Step 2: Match against booking templates
        if (templates) {
          const templateMatch = templates.find((t) => {
            if (t.vendor_iban && txnIban) {
              return (
                t.vendor_iban.replace(/\s/g, "").toUpperCase() ===
                txnIban.replace(/\s/g, "").toUpperCase()
              );
            }
            if (t.vendor_name && txn.purpose) {
              return txn.purpose
                .toLowerCase()
                .includes(t.vendor_name.toLowerCase());
            }
            return false;
          });

          if (templateMatch) {
            await supabase
              .from("bank_transactions")
              .update({
                match_status: "matched_template",
                matched_template_id: templateMatch.id,
              })
              .eq("id", txn.id);
            matchedCount++;
            continue;
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          statementId: statement.id,
          totalTransactions: savedTxns.length,
          matchedCount,
          unmatchedCount: savedTxns.length - matchedCount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        statementId: statement.id,
        totalTransactions: 0,
        matchedCount: 0,
        unmatchedCount: 0,
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
