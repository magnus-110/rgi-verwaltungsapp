import { supabase } from "@/integrations/supabase/client";

export interface SuggestMatchContext {
  invoices: any[];
  templates: any[];
  accounts: any[];
  billingPeriods: any[];
  bookingInstructions: string | null;
  buildingId: string;
  managementMode: string | null;
}

/**
 * Loads all context data needed for a suggest-match call for a given building.
 * Used by prefetch, TransactionReviewMode rerun, and AssignmentDialog.
 */
export async function loadSuggestMatchContext(buildingId: string): Promise<SuggestMatchContext> {
  const [{ data: templates }, { data: invoices }, { data: billingPeriods }, { data: accounts }, { data: buildingData }] = await Promise.all([
    supabase.from("booking_templates")
      .select("id, name, vendor_name, vendor_iban, expected_amount, amount_tolerance, interval, account_id, vat_rate, valid_from, valid_to, chart_of_accounts(account_number, account_name)")
      .eq("building_id", buildingId),
    supabase.from("invoices")
      .select("id, invoice_number, vendor_name, gross_amount, vendor_iban, invoice_date")
      .eq("building_id", buildingId)
      .eq("status", "paid")
      .limit(200),
    supabase.from("billing_periods")
      .select("fiscal_year, period_from, period_to")
      .eq("building_id", buildingId)
      .order("fiscal_year", { ascending: false })
      .limit(5),
    supabase.from("chart_of_accounts")
      .select("id, account_number, account_name, category, is_35a_relevant, default_distribution_key, is_billing_relevant, settlement_section")
      .or(`building_id.is.null,building_id.eq.${buildingId}`),
    supabase.from("buildings")
      .select("booking_instructions")
      .eq("id", buildingId)
      .single(),
  ]);

  return {
    templates: (templates || []).map((t: any) => ({
      id: t.id, name: t.name, vendor_name: t.vendor_name,
      expected_amount: t.expected_amount, amount_tolerance: t.amount_tolerance,
      vendor_iban: t.vendor_iban, interval: t.interval,
      account_number: t.chart_of_accounts?.account_number,
      account_name: t.chart_of_accounts?.account_name,
      account_id: t.account_id, valid_from: t.valid_from, valid_to: t.valid_to,
    })),
    invoices: (invoices || []).map((inv: any) => ({
      id: inv.id, invoice_number: inv.invoice_number, vendor_name: inv.vendor_name,
      gross_amount: inv.gross_amount, vendor_iban: inv.vendor_iban, invoice_date: inv.invoice_date,
    })),
    accounts: (accounts || []).map((a: any) => ({
      id: a.id, account_number: a.account_number, account_name: a.account_name,
      category: a.category, is_35a_relevant: a.is_35a_relevant,
    })),
    billingPeriods: (billingPeriods || []).map((bp: any) => ({
      fiscal_year: bp.fiscal_year, period_from: bp.period_from, period_to: bp.period_to,
    })),
    bookingInstructions: (buildingData as any)?.booking_instructions || null,
  };
}

/**
 * Loads historical bookings for a transaction's counterparty.
 */
export async function loadHistoricalBookings(buildingId: string, txn: any): Promise<any[]> {
  const txnIban = txn.amount < 0 ? txn.creditor_iban : txn.debtor_iban;
  const txnName = txn.amount < 0 ? txn.creditor_name : txn.debtor_name;

  if (!txnIban && !txnName) return [];

  let query = supabase.from("bank_transactions")
    .select("id, amount, booking_date, booked_at, booking_id")
    .eq("building_id", buildingId)
    .not("booked_at", "is", null)
    .order("booking_date", { ascending: false })
    .limit(20);

  if (txnIban) {
    query = txn.amount < 0
      ? query.eq("creditor_iban", txnIban)
      : query.eq("debtor_iban", txnIban);
  } else if (txnName) {
    query = txn.amount < 0
      ? query.ilike("creditor_name", `%${txnName}%`)
      : query.ilike("debtor_name", `%${txnName}%`);
  }

  const { data: histTxns } = await query;
  if (!histTxns || histTxns.length === 0) return [];

  const bookingIds = histTxns.map(t => t.booking_id).filter(Boolean);
  let invoiceMap: Record<string, boolean> = {};
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase.from("bookings")
      .select("id, invoice_id")
      .in("id", bookingIds.slice(0, 50));
    if (bookings) {
      bookings.forEach(b => { invoiceMap[b.id] = !!b.invoice_id; });
    }
  }

  return histTxns.map(t => ({
    amount: t.amount, date: t.booking_date,
    has_invoice: t.booking_id ? (invoiceMap[t.booking_id] || false) : false,
  }));
}

/**
 * Builds the full payload for a suggest-match call.
 */
export function buildSuggestMatchPayload(
  txn: any,
  ctx: SuggestMatchContext,
  allTransactions: any[],
  historicalBookings: any[]
) {
  return {
    transaction: txn,
    invoices: ctx.invoices,
    templates: ctx.templates,
    allTransactions: allTransactions.slice(0, 30),
    historicalBookings: historicalBookings.length > 0 ? historicalBookings : undefined,
    billingPeriods: ctx.billingPeriods,
    accounts: ctx.accounts,
    bookingInstructions: ctx.bookingInstructions,
  };
}

/**
 * Invoke suggest-match with a timeout. Returns the result or throws on timeout/error.
 */
export async function invokeSuggestMatchWithTimeout(
  payload: any,
  timeoutMs = 30000
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data, error } = await supabase.functions.invoke("suggest-match", {
      body: payload,
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
