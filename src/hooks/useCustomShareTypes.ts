import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lädt alle vom Nutzer angelegten share_types aus contact_building_shares.
 * Diese repräsentieren benutzerdefinierte Verteilerschlüssel (z.B. "garten",
 * "aufzug_anteil") und sollen überall im Verteilerschlüssel-Dropdown verfügbar sein.
 *
 * Optional auf eine Liegenschaft eingeschränkt (für BuildingDistributionKeysTab).
 *
 * Bekannte Standard-Schlüssel werden ausgefiltert, damit sie nicht doppelt erscheinen.
 */

const STANDARD_SHARE_TYPES = new Set([
  "mea",
  "whg.-mea",
  "gar.-mea",
  "sonder-mea",
  "einheit",
  "einheiten",
  "personen",
  "qm",
  "garagen",
  "stellplaetze",
  "wasser",
  "warmwasser",
  "verbrauch_wasser",
  "verbrauch_warmwasser",
  "heizkosten",
  "heizkostenverordnung",
  "heating_individual",
  "direkt",
  "units",
]);

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
