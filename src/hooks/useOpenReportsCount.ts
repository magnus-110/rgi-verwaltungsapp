import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";

export function useOpenReportsCount(enabled: boolean = true) {
  const [count, setCount] = useState(0);
  const { managementMode } = useManagementMode();
  const table = managementMode === "weg" ? "weg_reports" : "miete_reports";

  const fetchCount = useCallback(async () => {
    const { count: c } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    setCount(c ?? 0);
  }, [table]);

  useEffect(() => {
    if (!enabled) return;
    fetchCount();

    const channel = supabase
      .channel(`open-reports-count-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => fetchCount())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, fetchCount, table]);

  return count;
}
