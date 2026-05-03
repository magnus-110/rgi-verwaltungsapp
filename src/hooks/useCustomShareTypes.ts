import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SHARE_TYPES } from "@/lib/shareTypes";

/**
 * Lädt alle vom Nutzer angelegten share_types aus contact_building_shares,
 * die NICHT bereits Teil der globalen SHARE_TYPES-Liste sind.
 *
 * Diese stellen wirklich frei vergebene Schlüssel dar (z.B. "Haus 9/9a - MEA",
 * "Spüldienst", "garten") und werden zusätzlich zu den Standard-Schlüsseln im
 * Verteilerschlüssel-Dropdown angeboten.
 *
 * Optional auf eine Liegenschaft eingeschränkt.
 */

const STANDARD_SHARE_TYPES = new Set(
  SHARE_TYPES.map((s) => s.value.toLowerCase())
);

export function useCustomShareTypes(buildingId?: string) {
  return useQuery({
    queryKey: ["custom-share-types", buildingId || "global"],
    queryFn: async (): Promise<string[]> => {
      let query = supabase
        .from("contact_building_shares")
        .select("share_type, contact_building_assignments!inner(building_id)");
      if (buildingId) {
        query = query.eq("contact_building_assignments.building_id", buildingId);
      }
      const { data, error } = await query;
      if (error) throw error;
      const types = new Set<string>();
      for (const row of (data as any[]) || []) {
        const t = (row.share_type || "").trim();
        if (t && !STANDARD_SHARE_TYPES.has(t.toLowerCase())) {
          types.add(t);
        }
      }
      return [...types].sort((a, b) => a.localeCompare(b, "de"));
    },
  });
}
