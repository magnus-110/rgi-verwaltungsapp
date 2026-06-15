import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TourStatus = "completed" | "skipped";
export type TourProgress = Record<string, TourStatus> & { version?: number };

export const TOUR_VERSION = 1;

export function useTourProgress(userId: string | undefined) {
  const [progress, setProgress] = useState<TourProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setProgress(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_tour_progress")
        .select("progress")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setProgress(((data?.progress as TourProgress) ?? {}) as TourProgress);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markTour = useCallback(
    async (tourId: string, status: TourStatus) => {
      if (!userId) return;
      const next: TourProgress = {
        ...(progress ?? {}),
        [tourId]: status,
        version: TOUR_VERSION,
      };
      setProgress(next);
      await supabase
        .from("user_tour_progress")
        .upsert({ user_id: userId, progress: next }, { onConflict: "user_id" });
    },
    [progress, userId]
  );

  return { progress, loading, markTour };
}
