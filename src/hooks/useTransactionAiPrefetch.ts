import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

const BATCH_SIZE = 5;

interface PrefetchState {
  total: number;
  completed: number;
  running: boolean;
}

export function useTransactionAiPrefetch(
  buildingId: string | null,
  transactions: any[],
  enabled: boolean
) {
  const [state, setState] = useState<PrefetchState>({ total: 0, completed: 0, running: false });
  const abortRef = useRef(false);
  const runningRef = useRef(false);

  // Stable dependency: sorted IDs of transactions needing AI analysis
  const transactionIds = useMemo(() => {
    if (!enabled || !buildingId) return "";
    return transactions
      .filter((t: any) => !t.ai_suggestion && !t.booked_at)
      .map((t: any) => t.id)
      .sort()
      .join(",");
  }, [transactions, enabled, buildingId]);

  useEffect(() => {
    if (!enabled || !buildingId || !transactionIds) {
      setState({ total: 0, completed: 0, running: false });
      return;
    }

    if (runningRef.current) return;

    const unmatchedWithoutSuggestion = transactions.filter(
      (t: any) => !t.ai_suggestion && !t.booked_at
    );

    if (unmatchedWithoutSuggestion.length === 0) {
      setState({ total: 0, completed: 0, running: false });
      return;
    }

    abortRef.current = false;
    runningRef.current = true;
    setState({ total: unmatchedWithoutSuggestion.length, completed: 0, running: true });

    const run = async () => {
      // Load templates and invoices for context
      const [{ data: templates }, { data: invoices }, { data: billingPeriods }] = await Promise.all([
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
      ]);

      const billingPeriodData = (billingPeriods || []).map((bp: any) => ({
        fiscal_year: bp.fiscal_year,
        period_from: bp.period_from,
        period_to: bp.period_to,
      }));

      const templateData = (templates || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        vendor_name: t.vendor_name,
        expected_amount: t.expected_amount,
        amount_tolerance: t.amount_tolerance,
        vendor_iban: t.vendor_iban,
        interval: t.interval,
        account_number: t.chart_of_accounts?.account_number,
        account_name: t.chart_of_accounts?.account_name,
        account_id: t.account_id,
        valid_from: t.valid_from,
        valid_to: t.valid_to,
      }));

      const invoiceData = (invoices || []).map((inv: any) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        vendor_name: inv.vendor_name,
        gross_amount: inv.gross_amount,
        vendor_iban: inv.vendor_iban,
        invoice_date: inv.invoice_date,
      }));

      let completed = 0;

      for (let i = 0; i < unmatchedWithoutSuggestion.length; i += BATCH_SIZE) {
        if (abortRef.current) break;

        const batch = unmatchedWithoutSuggestion.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (txn: any) => {
          try {
            // Load historical bookings for this creditor/debtor
            const txnIban = txn.amount < 0 ? txn.creditor_iban : txn.debtor_iban;
            const txnName = txn.amount < 0 ? txn.creditor_name : txn.debtor_name;
            let historicalBookings: any[] = [];

            if (txnIban || txnName) {
              // Find matching transactions by IBAN or name to get booking history
              let query = supabase.from("bank_transactions")
                .select("id, amount, booking_date, booked_at, booking_id")
                .eq("building_id", buildingId)
                .not("booked_at", "is", null)
                .order("booking_date", { ascending: false })
                .limit(20);

              if (txnIban) {
                if (txn.amount < 0) {
                  query = query.eq("creditor_iban", txnIban);
                } else {
                  query = query.eq("debtor_iban", txnIban);
                }
              } else if (txnName) {
                if (txn.amount < 0) {
                  query = query.ilike("creditor_name", `%${txnName}%`);
                } else {
                  query = query.ilike("debtor_name", `%${txnName}%`);
                }
              }

              const { data: histTxns } = await query;
              if (histTxns && histTxns.length > 0) {
                // Check which had invoices
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
                  amount: t.amount,
                  date: t.booking_date,
                  has_invoice: t.booking_id ? (invoiceMap[t.booking_id] || false) : false,
                }));
              }
            }

            // Attach matched invoice date if available
            const enrichedTxn = { ...txn };
            if (txn.matched_invoice_id) {
              const matchedInv = invoiceData.find((inv: any) => inv.id === txn.matched_invoice_id);
              if (matchedInv) {
                enrichedTxn.matched_invoice_date = matchedInv.invoice_date;
              }
            }

            const { data, error } = await supabase.functions.invoke("suggest-match", {
              body: {
                transaction: enrichedTxn,
                invoices: invoiceData,
                templates: templateData,
                allTransactions: transactions.slice(0, 30),
                historicalBookings,
                billingPeriods: billingPeriodData,
              },
            });

            if (!error && data && !data.error) {
              await supabase.from("bank_transactions")
                .update({ ai_suggestion: data } as any)
                .eq("id", txn.id);
            }
          } catch (err) {
            console.error("AI prefetch error for txn", txn.id, err);
          }
        });

        await Promise.all(promises);
        completed += batch.length;
        setState(s => ({ ...s, completed }));
      }

      setState(s => ({ ...s, running: false }));
      runningRef.current = false;
    };

    run();

    return () => {
      abortRef.current = true;
      runningRef.current = false;
    };
  }, [buildingId, transactionIds, enabled]);

  return state;
}
