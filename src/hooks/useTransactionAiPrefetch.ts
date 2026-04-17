import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadSuggestMatchContext,
  loadHistoricalBookings,
  buildSuggestMatchPayload,
  invokeSuggestMatchWithTimeout,
} from "./useSuggestMatchContext";

const BATCH_SIZE = 3;
const MAX_TOTAL_CALLS = 200;
const MAX_CONSECUTIVE_ERRORS = 5;
const MAX_ATTEMPTS_PER_TXN = 2;
const DELAY_BETWEEN_BATCHES_MS = 600;
const PER_CALL_TIMEOUT_MS = 45000;

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
  const processedRunKeyRef = useRef("");

  const needsAiAnalysis = useCallback((t: any) => {
    if (t.ai_suggestion || t.booked_at) return false;
    // Skip transactions that have already been tried and failed permanently
    const status = (t as any).ai_analysis_status;
    const attempts = (t as any).ai_analysis_attempts ?? 0;
    if (status === "failed" && attempts >= MAX_ATTEMPTS_PER_TXN) return false;
    if (status === "skipped") return false;
    if (t.matched_invoice_id) return true;
    if (t.match_status === "unmatched") return true;
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

    if (isRunningRef.current) return;
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
        const ctx = await loadSuggestMatchContext(buildingId);

        if (abortRef.current || runIdRef.current !== currentRunId) {
          isRunningRef.current = false;
          return;
        }

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
            const currentAttempts = (txn.ai_analysis_attempts ?? 0) + 1;

            // Mark as pending before the call
            await supabase.from("bank_transactions")
              .update({
                ai_analysis_status: "pending",
                ai_analysis_attempted_at: new Date().toISOString(),
                ai_analysis_attempts: currentAttempts,
              } as any)
              .eq("id", txn.id);

            try {
              const historicalBookings = await loadHistoricalBookings(buildingId, txn);
              const payload = buildSuggestMatchPayload(txn, ctx, transactions, historicalBookings);
              const data = await invokeSuggestMatchWithTimeout(payload, PER_CALL_TIMEOUT_MS);

              if (data) {
                await supabase.from("bank_transactions")
                  .update({
                    ai_suggestion: data,
                    ai_analysis_status: "success",
                  } as any)
                  .eq("id", txn.id);
              } else {
                await supabase.from("bank_transactions")
                  .update({ ai_analysis_status: "failed" } as any)
                  .eq("id", txn.id);
                throw new Error("Empty AI response");
              }
            } catch (err) {
              await supabase.from("bank_transactions")
                .update({ ai_analysis_status: "failed" } as any)
                .eq("id", txn.id);
              throw err;
            }
          }));

          const batchErrors = results.filter(r => r.status === "rejected").length;
          totalErrors += batchErrors;

          if (batchErrors === batch.length) {
            consecutiveErrors += batchErrors;
          } else {
            consecutiveErrors = 0;
          }

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

  const reset = useCallback(() => {
    abortRef.current = true;
    isRunningRef.current = false;
    processedRunKeyRef.current = "";
    setState({ total: 0, completed: 0, running: false, errors: 0 });
  }, []);

  return { ...state, reset };
}
