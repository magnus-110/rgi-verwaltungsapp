import { useEffect, useState, useRef } from "react";
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

  useEffect(() => {
    if (!enabled || !buildingId || runningRef.current) return;

    const unmatchedWithoutSuggestion = transactions.filter(
      (t: any) => (t.match_status === "unmatched" || t.match_status === "invoice_pending") && !t.ai_suggestion && !t.booked_at
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
      const [{ data: templates }, { data: invoices }] = await Promise.all([
        supabase.from("booking_templates")
          .select("id, name, vendor_name, vendor_iban, expected_amount, interval, account_id, vat_rate, valid_from, valid_to, chart_of_accounts(account_number, account_name)")
          .eq("building_id", buildingId),
        supabase.from("invoices")
          .select("id, invoice_number, vendor_name, gross_amount, vendor_iban, invoice_date")
          .eq("building_id", buildingId)
          .eq("status", "paid")
          .limit(200),
      ]);

      const templateData = (templates || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        vendor_name: t.vendor_name,
        expected_amount: t.expected_amount,
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
            const { data, error } = await supabase.functions.invoke("suggest-match", {
              body: {
                transaction: txn,
                invoices: invoiceData,
                templates: templateData,
                allTransactions: transactions.slice(0, 30),
              },
            });

            if (!error && data && !data.error) {
              // Store the suggestion
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
  }, [buildingId, transactions.length, enabled]);

  return state;
}
