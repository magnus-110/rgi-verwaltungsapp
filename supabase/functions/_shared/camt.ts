// Gemeinsame Bausteine für das Einlesen von Kontoumsätzen im CAMT-Format
// (ISO 20022, camt.052/053/054). Genutzt vom Datei-Import
// (parse-bank-statement) und vom Abruf über die Bank (fints).
//
// Bis 15.10.2026 standen diese Funktionen direkt in parse-bank-statement.

export function stripNamespaces(xml: string): string {
  let cleaned = xml.replace(/\sxmlns(:[a-zA-Z0-9]+)?="[^"]*"/g, "");
  cleaned = cleaned.replace(/<\/?[a-zA-Z0-9]+:/g, (match) => {
    return match.startsWith("</") ? "</" : "<";
  });
  return cleaned;
}

export function getTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

export function getAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  return xml.match(re) || [];
}

export async function computeHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseEntries(stmt: string, buildingId: string | null, statementId: string) {
  const entries = getAllTags(stmt, "Ntry");
  const transactions: any[] = [];

  for (const entry of entries) {
    const amtMatch = entry.match(/<Amt[^>]*>([\d.,]+)<\/Amt>/i);
    const amount = amtMatch ? parseCamtAmount(amtMatch[1]) : 0;
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

export async function addHashes(transactions: any[]): Promise<any[]> {
  // Identische Umsätze innerhalb EINER Datei (z. B. zwei Rücklastschrift-Gebühren
  // gleicher Höhe am selben Tag ohne EndToEndId) ergaben bisher denselben Hash und
  // ließen den Insert mit 23505 scheitern. Erstes Vorkommen behält den bisherigen
  // Hash (kompatibel zu bereits importierten Daten), jedes weitere bekommen ein
  // "#n"-Suffix. Deterministisch -> erneuter Import derselben Datei bleibt dedupliziert.
  const occurrences = new Map<string, number>();
  for (const txn of transactions) {
    const base = `${txn.booking_date}|${txn.amount}|${txn.creditor_iban || ""}|${txn.debtor_iban || ""}|${txn.purpose || ""}|${txn.end_to_end_ref || ""}`;
    const n = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, n);
    txn.transaction_hash = await computeHash(n === 1 ? base : `${base}#${n}`);
  }
  return transactions;
}

// CAMT-Beträge (052/053/054) haben laut ISO 20022 immer "." als Dezimaltrenner und
// keine Tausenderpunkte. Nur falls doch ein Komma vorkommt, deutsch interpretieren.
export function parseCamtAmount(raw: string): number {
  const s = raw.trim();
  const v = s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s);
  return isNaN(v) ? 0 : v;
}

/** Liegenschaft zur Konto-IBAN laut building_bank_accounts (oder null). */
export async function buildingFuerIban(supabase: any, iban: string | null): Promise<string | null> {
  if (!iban) return null;
  const clean = iban.replace(/\s/g, "").toUpperCase();
  const { data } = await supabase
    .from("building_bank_accounts")
    .select("building_id")
    .eq("iban", clean)
    .limit(2);
  if (!data || data.length !== 1) return null;
  return data[0].building_id;
}

export async function deduplicateTransactions(supabase: any, transactions: any[], buildingId: string | null): Promise<{ unique: any[]; duplicateCount: number }> {
  if (transactions.length === 0) return { unique: [], duplicateCount: 0 };

  const hashes = transactions.map((t) => t.transaction_hash);

  // Scope duplicate check to the same building – identische Buchungstexte/Beträge
  // in unterschiedlichen Liegenschaften sind keine Duplikate.
  const existingHashes = new Set<string>();
  for (let i = 0; i < hashes.length; i += 100) {
    const batch = hashes.slice(i, i + 100);
    let query = supabase
      .from("bank_transactions")
      .select("transaction_hash")
      .in("transaction_hash", batch);
    if (buildingId) {
      query = query.eq("building_id", buildingId);
    } else {
      query = query.is("building_id", null);
    }
    const { data } = await query;
    if (data) {
      data.forEach((r: any) => existingHashes.add(r.transaction_hash));
    }
  }

  const unique = transactions.filter((t) => !existingHashes.has(t.transaction_hash));
  return { unique, duplicateCount: transactions.length - unique.length };
}

/**
 * Zweite Doppelprüfung gegen ALLE vorhandenen Bewegungen dieses Kontos
 * (auch aus hochgeladenen Dateien). Die Bank schreibt Texte je Weg leicht
 * anders („ABSCHLUSS PER …" in der Datei, „Abschluss per … Saldo …" per
 * FinTS), deshalb hilft die Prüfsumme allein nicht. Verglichen wird
 * Buchungstag + Betrag + Gegen-IBAN und gezählt: Gibt es eine Bewegung
 * schon k-mal, werden nur die darüber hinausgehenden neu angelegt.
 */
export async function bestandAbziehen(admin: any, iban: string, alle: any[], kandidaten: any[], von: string, bis: string) {
  if (kandidaten.length === 0) return [];
  const cleanIban = (i: string | null | undefined) => (i ?? "").replace(/\s+/g, "").toUpperCase();
  iban = cleanIban(iban);
  const schluessel = (t: any) =>
    `${String(t.booking_date).slice(0, 10)}|${Number(t.amount).toFixed(2)}|${cleanIban(t.creditor_iban)}|${cleanIban(t.debtor_iban)}`;

  // vorhandene Bewegungen dieses Kontos im Zeitraum
  const { data: auszuege } = await admin.from("bank_statements").select("id, account_iban");
  const ids = (auszuege ?? []).filter((x: any) => cleanIban(x.account_iban) === iban).map((x: any) => x.id);
  const vorhanden = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin
      .from("bank_transactions")
      .select("booking_date, amount, creditor_iban, debtor_iban")
      .in("statement_id", ids.slice(i, i + 100))
      .gte("booking_date", von)
      .lte("booking_date", bis);
    (data ?? []).forEach((t: any) => vorhanden.set(schluessel(t), (vorhanden.get(schluessel(t)) ?? 0) + 1));
  }

  // je Schlüssel: wie oft liefert die Bank sie, wie oft gibt es sie schon?
  const neuJe = new Map<string, number>();
  alle.forEach((t) => neuJe.set(schluessel(t), (neuJe.get(schluessel(t)) ?? 0) + 1));
  const erlaubt = new Map<string, number>();
  for (const [k, n] of neuJe) erlaubt.set(k, Math.max(0, n - (vorhanden.get(k) ?? 0)));

  const ergebnis: any[] = [];
  for (const t of kandidaten) {
    const k = schluessel(t);
    const rest = erlaubt.get(k) ?? 0;
    if (rest > 0) {
      ergebnis.push(t);
      erlaubt.set(k, rest - 1);
    }
  }
  return ergebnis;
}

export async function matchTransactions(supabase: any, statementId: string, buildingId: string | null) {
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

export async function resolveBankAccountId(
  supabase: any, buildingId: string, iban: string | null,
): Promise<string | null> {
  if (iban) {
    const cleanIban = iban.replace(/\s/g, "").toUpperCase();
    const { data: mapping } = await supabase
      .from("building_bank_accounts").select("coa_account_id")
      .eq("building_id", buildingId).eq("iban", cleanIban).limit(1);
    if (mapping?.length && mapping[0].coa_account_id) return mapping[0].coa_account_id;
  }
  const { data: coa } = await supabase
    .from("chart_of_accounts").select("id, account_number, account_name")
    .or("account_number.like.18%,account_number.like.10%")
    .or(`building_id.is.null,building_id.eq.${buildingId}`);
  const bank = (coa || []).find((a: any) => /bank|giro|tagesgeld/i.test(a.account_name || ""));
  return bank?.id ?? null;
}

export async function upsertReconMonth(
  supabase: any, buildingId: string, bankAccountId: string, statementId: string,
  year: number, month: number, opening: number | null, closing: number | null,
  source: "pdf_import" | "camt_import",
): Promise<void> {
  const { data: existing } = await supabase
    .from("bank_reconciliations").select("id, opening_balance_bank, closing_balance_bank, bank_source")
    .eq("building_id", buildingId).eq("bank_account_id", bankAccountId)
    .eq("period_year", year).eq("period_month", month).maybeSingle();
  if (existing && existing.bank_source !== source && existing.bank_source !== null
      && (existing.closing_balance_bank != null || existing.opening_balance_bank != null)) {
    return;
  }
  const payload: any = {
    building_id: buildingId, bank_account_id: bankAccountId,
    period_year: year, period_month: month,
    bank_source: source, source_statement_id: statementId, status: "open",
  };
  if (opening != null) payload.opening_balance_bank = opening;
  if (closing != null) payload.closing_balance_bank = closing;
  await supabase.from("bank_reconciliations")
    .upsert(payload, { onConflict: "building_id,bank_account_id,period_year,period_month" });
}

export async function syncReconciliation(
  supabase: any, buildingId: string, statementId: string, iban: string | null,
  dateFrom: string | null, dateTo: string | null,
  opening: number | null, closing: number | null,
  source: "pdf_import" | "camt_import",
): Promise<void> {
  if (!buildingId || !dateTo || (opening == null && closing == null)) return;
  const bankAccountId = await resolveBankAccountId(supabase, buildingId, iban);
  if (!bankAccountId) return;

  const dEnd = new Date(dateTo);
  const dStart = dateFrom ? new Date(dateFrom) : dEnd;
  const startYear = dStart.getFullYear();
  const startMonth = dStart.getMonth() + 1;
  const endYear = dEnd.getFullYear();
  const endMonth = dEnd.getMonth() + 1;

  if (startYear === endYear && startMonth === endMonth) {
    await upsertReconMonth(supabase, buildingId, bankAccountId, statementId, endYear, endMonth, opening, closing, source);
    return;
  }
  await upsertReconMonth(supabase, buildingId, bankAccountId, statementId, startYear, startMonth, opening, null, source);
  await upsertReconMonth(supabase, buildingId, bankAccountId, statementId, endYear, endMonth, null, closing, source);
  let y = startYear, m = startMonth + 1;
  while (y < endYear || (y === endYear && m < endMonth)) {
    if (m > 12) { m = 1; y++; continue; }
    await upsertReconMonth(supabase, buildingId, bankAccountId, statementId, y, m, null, null, source);
    m++;
  }
}

export interface CamtKopf {
  iban: string;
  name: string;
  von: string | null;
  bis: string | null;
  anfangssaldo: number | null;
  endsaldo: number | null;
}

/** Konto, Zeitraum und Salden eines <Stmt>/<Rpt>-Blocks. */
export function leseKopf(stmt: string): CamtKopf {
  const iban = getTag(getTag(getTag(stmt, "Acct"), "Id"), "IBAN");
  const name = getTag(getTag(stmt, "Acct"), "Nm");
  const frToDt = getTag(stmt, "FrToDt");
  let von: string | null = getTag(frToDt, "FrDtTm").substring(0, 10) || getTag(frToDt, "FrDt") || null;
  let bis: string | null = getTag(frToDt, "ToDtTm").substring(0, 10) || getTag(frToDt, "ToDt") || null;
  // camt.052 (Umsatzbericht) liefert oft kein <FrToDt> -> Zeitraum aus den Buchungsdaten
  if (!von || !bis) {
    const dates = getAllTags(stmt, "BookgDt")
      .map((b) => (getTag(b, "Dt") || getTag(b, "DtTm")).substring(0, 10))
      .filter(Boolean)
      .sort();
    if (dates.length) {
      von = von || dates[0];
      bis = bis || dates[dates.length - 1];
    }
  }
  // Salden: OPBD/PRCD = Anfang, CLBD = Ende
  let anfangssaldo: number | null = null;
  let endsaldo: number | null = null;
  for (const bal of getAllTags(stmt, "Bal")) {
    const code = getTag(getTag(getTag(bal, "Tp"), "CdOrPrtry"), "Cd");
    const amtMatch = bal.match(/<Amt[^>]*>([\d.,]+)<\/Amt>/i);
    if (!amtMatch) continue;
    const value = (getTag(bal, "CdtDbtInd") === "DBIT" ? -1 : 1) * parseCamtAmount(amtMatch[1]);
    if ((code === "OPBD" || code === "PRCD") && anfangssaldo == null) anfangssaldo = value;
    if (code === "CLBD") endsaldo = value;
  }
  return { iban, name, von, bis, anfangssaldo, endsaldo };
}

/** Alle <Stmt>- bzw. <Rpt>-Blöcke einer CAMT-Datei (ohne Namensräume). */
export function camtBloecke(xml: string): string[] {
  const clean = stripNamespaces(xml);
  let stmts = getAllTags(clean, "Stmt");
  if (stmts.length === 0) {
    const rpts = getAllTags(clean, "Rpt");
    stmts = rpts.length > 0 ? rpts : [clean];
  }
  return stmts;
}
