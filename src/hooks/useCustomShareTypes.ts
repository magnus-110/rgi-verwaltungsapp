import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lädt die für ein konkretes Gebäude angelegten Custom-Verteilerschlüssel
 * aus dem Katalog `building_share_types`. Ohne buildingId leer.
 *
 * Standardschlüssel (SHARE_TYPES) werden NICHT zurückgegeben — Aufrufer
 * mischen sie selbst dazu.
 */
export function useCustomShareTypes(buildingId?: string) {
  return useQuery({
    queryKey: ["custom-share-types", buildingId || "none"],
    queryFn: async (): Promise<string[]> => {
      if (!buildingId) return [];
      const { data, error } = await supabase
        .from("building_share_types")
        .select("value")
        .eq("building_id", buildingId);
      if (error) throw error;
      const set = new Set<string>();
      for (const row of (data as any[]) || []) {
        const v = (row.value || "").trim();
        if (v) set.add(v);
      }
      return [...set].sort((a, b) => a.localeCompare(b, "de"));
    },
    enabled: !!buildingId,
  });
}
