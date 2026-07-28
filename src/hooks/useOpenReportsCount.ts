import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOpenReportsCount(enabled: boolean = true) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      if (!cancelled) setCount(c ?? 0);
    };

    fetchCount();

    const channel = supabase
      .channel("open-reports-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reports" },
        () => fetchCount(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return count;
}
