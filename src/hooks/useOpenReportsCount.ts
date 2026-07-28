import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOpenReportsCount(enabled: boolean = true) {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    const [weg, miete] = await Promise.all([
      supabase.from("weg_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("miete_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);
    setCount((weg.count ?? 0) + (miete.count ?? 0));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchCount();

    const channel = supabase
      .channel("open-reports-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "weg_reports" }, () => fetchCount())
      .on("postgres_changes", { event: "*", schema: "public", table: "miete_reports" }, () => fetchCount())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, fetchCount]);

  return count;
}
