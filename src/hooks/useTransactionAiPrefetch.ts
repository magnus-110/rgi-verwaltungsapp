// Deprecated: KI-Buchungsvorschläge wurden global entfernt.
// Hook bleibt als no-op Stub für bestehende Imports.
import { useCallback } from "react";

interface PrefetchState {
  total: number;
  completed: number;
  running: boolean;
  errors: number;
  abortReason?: string;
}

export function useTransactionAiPrefetch(
  _buildingId: string | null,
  _transactions: any[],
  _enabled: boolean
): PrefetchState & { reset: () => void } {
  const reset = useCallback(() => {}, []);
  return { total: 0, completed: 0, running: false, errors: 0, reset };
}
