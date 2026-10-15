import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import {
  addHashes,
  buildingFuerIban,
  bestandAbziehen,
  deduplicateTransactions,
  getAllTags,
  getTag,
  matchTransactions,
  parseCamtAmount,
  parseEntries,
  stripNamespaces,
  syncReconciliation,
} from "../_shared/camt.ts";

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

    // Mehrere <Stmt>-Blöcke pro CAMT-Datei möglich (z. B. monatlich gebündelt)
    let stmts = getAllTags(cleanXml, "Stmt");
    if (stmts.length === 0) {
      const rpts = getAllTags(cleanXml, "Rpt");
      stmts = rpts.length > 0 ? rpts : [cleanXml];
    }
    console.log("XML length:", cleanXml.length, "Statement blocks:", stmts.length);

    const perStatement: any[] = [];
    let totalUnique = 0;
    let totalDuplicates = 0;
    let totalMatched = 0;
    let lastStatementId: string | null = null;
    const warnings: string[] = [];

    for (const stmt of stmts) {
      const accountIban = getTag(getTag(getTag(stmt, "Acct"), "Id"), "IBAN");
      const accountName = getTag(getTag(stmt, "Acct"), "Nm");

      // Liegenschaft über die IBAN des Kontos (building_bank_accounts).
      // Ist die IBAN hinterlegt, gilt sie – auch wenn beim Hochladen eine
      // andere Liegenschaft gewählt war. Ohne Treffer gilt die Auswahl.
      const ibanBuilding = await buildingFuerIban(supabase, accountIban || null);
      const stmtBuilding: string | null = ibanBuilding || buildingId || null;
      if (ibanBuilding && buildingId && ibanBuilding !== buildingId) {
        warnings.push(`Konto ${accountIban} gehört zu einer anderen Liegenschaft und wurde dort eingelesen.`);
      }
      if (!stmtBuilding) {
        warnings.push(`Konto ${accountIban || "ohne IBAN"} ist keiner Liegenschaft zugeordnet – übersprungen.`);
        perStatement.push({ period: null, inserted: 0, duplicates: 0, matched: 0, skipped: true, iban: accountIban || null });
        continue;
      }

      const frToDt = getTag(stmt, "FrToDt");
      let frDt: string | null = getTag(frToDt, "FrDtTm").substring(0, 10) ||
                   getTag(frToDt, "FrDt") || null;
      let toDt: string | null = getTag(frToDt, "ToDtTm").substring(0, 10) ||
                   getTag(frToDt, "ToDt") || null;
      // camt.052 (Umsatzbericht) liefert oft kein <FrToDt> -> Zeitraum aus den Buchungsdaten
      if (!frDt || !toDt) {
        const dates = getAllTags(stmt, "BookgDt")
          .map((b) => (getTag(b, "Dt") || getTag(b, "DtTm")).substring(0, 10))
          .filter(Boolean)
          .sort();
        if (dates.length) {
          frDt = frDt || dates[0];
          toDt = toDt || dates[dates.length - 1];
        }
      }

      // Salden: OPBD/PRCD = opening, CLBD = closing
      const balanceBlocks = getAllTags(stmt, "Bal");
      let openingBalance: number | null = null;
      let closingBalance: number | null = null;
      for (const bal of balanceBlocks) {
        const code = getTag(getTag(getTag(bal, "Tp"), "CdOrPrtry"), "Cd");
        const amtMatch = bal.match(/<Amt[^>]*>([\d.,]+)<\/Amt>/i);
        if (!amtMatch) continue;
        const raw = parseCamtAmount(amtMatch[1]);
        const sign = getTag(bal, "CdtDbtInd") === "DBIT" ? -1 : 1;
        const value = sign * raw;
        if ((code === "OPBD" || code === "PRCD") && openingBalance == null) openingBalance = value;
        if (code === "CLBD") closingBalance = value;
      }

      const stmtLabel = frDt && toDt ? `${frDt}…${toDt}` : (toDt || "CAMT");

      const { data: statement, error: stmtError } = await supabase
        .from("bank_statements")
        .insert({
          building_id: stmtBuilding,
          file_name: `CAMT XML Import ${stmtLabel}`,
          account_iban: accountIban || null,
          account_name: accountName || null,
          statement_date_from: frDt,
          statement_date_to: toDt,
          opening_balance: openingBalance,
          closing_balance: closingBalance,
          source_format: "camt_xml",
          fiscal_year: Number(fiscalYear) || (toDt ? new Date(toDt).getFullYear() : new Date().getFullYear()),
          created_by: user.id,
        })
        .select()
        .single();
      if (stmtError) throw stmtError;

      let transactions = parseEntries(stmt, stmtBuilding, statement.id);
      transactions = await addHashes(transactions);
      const { unique: nachHash } = await deduplicateTransactions(supabase, transactions, stmtBuilding);
      // auch gegen Bewegungen, die per Bankabruf (FinTS) schon da sind
      const daten = transactions.map((t: any) => String(t.booking_date).slice(0, 10)).sort();
      const unique = accountIban && daten.length
        ? await bestandAbziehen(supabase, accountIban, transactions, nachHash, daten[0], daten[daten.length - 1])
        : nachHash;
      const duplicateCount = transactions.length - unique.length;

      if (unique.length > 0) {
        const { error: txError } = await supabase.from("bank_transactions").insert(unique);
        if (txError) {
          // Kein leeres Statement zurücklassen
          await supabase.from("bank_statements").delete().eq("id", statement.id);
          throw txError;
        }
      }

      if (unique.length === 0 && duplicateCount > 0) {
        // Leeres Statement wieder entfernen
        await supabase.from("bank_statements").delete().eq("id", statement.id);
        perStatement.push({ period: stmtLabel, inserted: 0, duplicates: duplicateCount, matched: 0 });
        totalDuplicates += duplicateCount;
        continue;
      }

      const matchResult = unique.length > 0
        ? await matchTransactions(supabase, statement.id, stmtBuilding)
        : { matched: 0, total: 0 };

      if (openingBalance != null || closingBalance != null) {
        try {
          await syncReconciliation(
            supabase, stmtBuilding, statement.id, accountIban || null,
            frDt, toDt, openingBalance, closingBalance, "camt_import",
          );
        } catch (e) { console.warn("recon sync failed:", e); }
      }

      lastStatementId = statement.id;
      totalUnique += unique.length;
      totalDuplicates += duplicateCount;
      totalMatched += matchResult.matched;
      perStatement.push({
        period: stmtLabel,
        statementId: statement.id,
        inserted: unique.length,
        duplicates: duplicateCount,
        matched: matchResult.matched,
        opening: openingBalance,
        closing: closingBalance,
        buildingId: stmtBuilding,
        iban: accountIban || null,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        statementId: lastStatementId,
        statementsProcessed: perStatement.length,
        perStatement,
        totalTransactions: totalUnique,
        duplicatesSkipped: totalDuplicates,
        matchedCount: totalMatched,
        unmatchedCount: totalUnique - totalMatched,
        warnings,
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
