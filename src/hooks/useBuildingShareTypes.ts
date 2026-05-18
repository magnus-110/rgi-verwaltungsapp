import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SHARE_TYPES, getShareTypeLabel } from "@/lib/shareTypes";

/**
 * Liefert die Verteilerschlüssel-Liste, die im jeweiligen Kontext im Dropdown
 * "Verteilerschlüssel" angeboten wird.
 *
 *  - Mit buildingId  → exakt die share_types, die im jeweiligen Gebäude
 *    unter contact_building_shares tatsächlich gepflegt sind. Sowohl
 *    Standard- (mea, qm, …) als auch Custom-Schlüssel (z. B. "Zwischenablesung
 *    Heizkosten") werden zurückgegeben. Identisch zur Liste im Personen-Tab.
 *
 *  - Ohne buildingId (globaler Kontenrahmen) → nur die globalen Standard-
 *    Schlüssel aus SHARE_TYPES.
 *
 *  Optional kann ein "currentValue" übergeben werden (z. B. der aktuell am
 *  Konto gespeicherte Schlüssel). Wenn dieser nicht in der gefilterten Liste
 *  steht, wird er trotzdem als "(nicht im Gebäude gepflegt)" angehängt,
 *  damit der User ihn sehen und korrigieren kann.
 */
export interface ShareTypeOption {
  value: string;
  label: string;
  stale?: boolean;
}

export function useBuildingShareTypes(buildingId?: string | null, currentValue?: string | null) {
  const query = useQuery<ShareTypeOption[]>({
    queryKey: ["building-share-types", buildingId || "global"],
    queryFn: async () => {
      if (!buildingId) {
        return SHARE_TYPES.map((s) => ({ value: s.value, label: s.label }));
      }
      const { data, error } = await supabase
        .from("contact_building_shares")
        .select("share_type, contact_building_assignments!inner(building_id)")
        .eq("contact_building_assignments.building_id", buildingId);
      if (error) throw error;
      const set = new Set<string>();
      for (const row of (data as any[]) || []) {
        const t = (row.share_type || "").trim();
        if (t) set.add(t);
      }
      return [...set]
        .sort((a, b) => a.localeCompare(b, "de"))
        .map((v) => ({ value: v, label: getShareTypeLabel(v) }));
    },
  });

  // Aktuellen Wert ggf. als "stale"-Option ergänzen, falls er nicht (mehr)
  // in der gefilterten Liste vorkommt.
  const options: ShareTypeOption[] = (() => {
    const base = query.data || [];
    if (!currentValue) return base;
    if (base.some((o) => o.value === currentValue)) return base;
    return [
      ...base,
      { value: currentValue, label: `${getShareTypeLabel(currentValue)} (nicht im Gebäude gepflegt)`, stale: true },
    ];
  })();

  return { ...query, options };
}
