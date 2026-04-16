import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const BATCH_SIZE = 5;
const MAX_TOTAL_CALLS = 200;
const MAX_CONSECUTIVE_ERRORS = 5;
const DELAY_BETWEEN_BATCHES_MS = 500;

interface PrefetchState {
  total: number;
  completed: number;
  running: boolean;
  errors: number;
  abortReason?: string;
}

export function useTransactionAiPrefetch(
  buildingId: string | null,
  transactions: any[],
  enabled: boolean
) {
  const [state, setState] = useState<PrefetchState>({ total: 0, completed: 0, running: false, errors: 0 });
  const abortRef = useRef(false);
  const runIdRef = useRef(0);
  const isRunningRef = useRef(false);
  // Snapshot the transaction IDs at run start so intermediate query refetches don't restart
  const processedRunKeyRef = useRef("");

  // Build a stable key from transactions that need analysis
  // Include transactions that are unmatched OR have a matched invoice (regardless of match_status string)
  // Exclude template-only matches (deterministic logic suffices for those)
  const needsAiAnalysis = useCallback((t: any) => {
    if (t.ai_suggestion || t.booked_at) return false;
    // Has invoice → always analyze (includes manually_matched)
    if (t.matched_invoice_id) return true;
    // Unmatched → analyze
    if (t.match_status === "unmatched") return true;
    // Template-only → skip (template provides deterministic account)
    return false;
  }, []);

  const pendingKey = useMemo(() => {
    if (!enabled || !buildingId) return "";
    return transactions
      .filter(needsAiAnalysis)
      .map((t: any) => t.id)
      .sort()
      .join(",");
  }, [transactions, enabled, buildingId, needsAiAnalysis]);

  useEffect(() => {
    if (!enabled || !buildingId || !pendingKey) {
      if (!isRunningRef.current) {
        setState({ total: 0, completed: 0, running: false, errors: 0 });
      }
      return;
    }

    // If already running, skip — intermediate refetches should not restart the run
    if (isRunningRef.current) return;

    // If we already processed this exact set, skip
    if (processedRunKeyRef.current === pendingKey) return;

    const unmatchedWithoutSuggestion = transactions.filter(needsAiAnalysis);

    if (unmatchedWithoutSuggestion.length === 0) {
      setState({ total: 0, completed: 0, running: false, errors: 0 });
      return;
    }

    abortRef.current = false;
    isRunningRef.current = true;
    processedRunKeyRef.current = pendingKey;
    const currentRunId = ++runIdRef.current;

    const txnsToProcess = unmatchedWithoutSuggestion.slice(0, MAX_TOTAL_CALLS);
    const totalToProcess = txnsToProcess.length;
    setState({ total: totalToProcess, completed: 0, running: true, errors: 0 });

    const run = async () => {
      try {
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

        if (abortRef.current || runIdRef.current !== currentRunId) {
          isRunningRef.current = false;
          return;
        }

        const billingPeriodData = (billingPeriods || []).map((bp: any) => ({
          fiscal_year: bp.fiscal_year, period_from: bp.period_from, period_to: bp.period_to,
        }));

        const templateData = (templates || []).map((t: any) => ({
          id: t.id, name: t.name, vendor_name: t.vendor_name,
          expected_amount: t.expected_amount, amount_tolerance: t.amount_tolerance,
          vendor_iban: t.vendor_iban, interval: t.interval,
          account_number: t.chart_of_accounts?.account_number,
          account_name: t.chart_of_accounts?.account_name,
          account_id: t.account_id, valid_from: t.valid_from, valid_to: t.valid_to,
        }));

        const accountData = (accounts || []).map((a: any) => ({
          id: a.id, account_number: a.account_number, account_name: a.account_name,
          category: a.category, is_35a_relevant: a.is_35a_relevant,
        }));

        const bookingInstructions = (buildingData as any)?.booking_instructions || null;

        const invoiceData = (invoices || []).map((inv: any) => ({
          id: inv.id, invoice_number: inv.invoice_number, vendor_name: inv.vendor_name,
          gross_amount: inv.gross_amount, vendor_iban: inv.vendor_iban, invoice_date: inv.invoice_date,
        }));

        let completed = 0;
        let consecutiveErrors = 0;
        let totalErrors = 0;

        for (let i = 0; i < txnsToProcess.length; i += BATCH_SIZE) {
          if (abortRef.current || runIdRef.current !== currentRunId) break;

          if (i > 0) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
          }

          const batch = txnsToProcess.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map(async (txn: any) => {
            const txnIban = txn.amount < 0 ? txn.creditor_iban : txn.debtor_iban;
            const txnName = txn.amount < 0 ? txn.creditor_name : txn.debtor_name;
            let historicalBookings: any[] = [];

            if (txnIban || txnName) {
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
              if (histTxns && histTxns.length > 0) {
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
                historicalBookings = histTxns.map(t => ({
                  amount: t.amount, date: t.booking_date,
                  has_invoice: t.booking_id ? (invoiceMap[t.booking_id] || false) : false,
                }));
              }
            }

            const enrichedTxn = { ...txn };
            if (txn.matched_invoice_id) {
              const matchedInv = invoiceData.find((inv: any) => inv.id === txn.matched_invoice_id);
              if (matchedInv) enrichedTxn.matched_invoice_date = matchedInv.invoice_date;
            }

            const { data, error } = await supabase.functions.invoke("suggest-match", {
              body: {
                transaction: enrichedTxn, invoices: invoiceData, templates: templateData,
                allTransactions: transactions.slice(0, 30), historicalBookings,
                billingPeriods: billingPeriodData, accounts: accountData, bookingInstructions,
              },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            if (data) {
              await supabase.from("bank_transactions")
                .update({ ai_suggestion: data } as any)
                .eq("id", txn.id);
            }
          }));

          const batchErrors = results.filter(r => r.status === "rejected").length;
          totalErrors += batchErrors;
          consecutiveErrors = batchErrors === batch.length ? consecutiveErrors + batchErrors : 0;

          completed += batch.length;
          setState(s => ({ ...s, completed, errors: totalErrors }));

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.error(`AI prefetch aborted: ${consecutiveErrors} consecutive errors`);
            setState(s => ({ ...s, running: false, abortReason: `Abgebrochen nach ${consecutiveErrors} Fehlern` }));
            isRunningRef.current = false;
            return;
          }
        }

        if (runIdRef.current === currentRunId) {
          setState(s => ({ ...s, running: false }));
        }
      } catch (err) {
        console.error("AI prefetch fatal error:", err);
        if (runIdRef.current === currentRunId) {
          setState(s => ({ ...s, running: false, abortReason: "Fehler beim Laden der Kontextdaten" }));
        }
      } finally {
        isRunningRef.current = false;
      }
    };

    run();

    return () => {
      abortRef.current = true;
    };
  }, [buildingId, pendingKey, enabled]);

  // Allow restarting by clearing the processed key (e.g. after handleRematch)
  const reset = useCallback(() => {
    abortRef.current = true;
    isRunningRef.current = false;
    processedRunKeyRef.current = "";
    setState({ total: 0, completed: 0, running: false, errors: 0 });
  }, []);

  return { ...state, reset };
}
