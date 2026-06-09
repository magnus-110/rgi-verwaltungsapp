import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SHARE_TYPES, getShareTypeLabel } from "@/lib/shareTypes";

/**
 * Liefert die Verteilerschlüssel-Liste, die im jeweiligen Kontext im Dropdown
 * "Verteilerschlüssel" angeboten wird.
 *
 *  - Mit buildingId  → ALLE globalen Standard-Schlüssel (SHARE_TYPES) plus alle
 *    Custom-Schlüssel, die für genau dieses Gebäude im Katalog
 *    `building_share_types` angelegt wurden, plus (Fallback) Werte, die bereits
 *    in `contact_building_shares` dieses Gebäudes verwendet werden, aber noch
 *    nicht im Katalog stehen. Custom-Schlüssel sind streng pro Gebäude isoliert.
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
  custom?: boolean;
}

const STANDARD_VALUES_LOWER = new Set(SHARE_TYPES.map((s) => s.value.toLowerCase()));

export function useBuildingShareTypes(buildingId?: string | null, currentValue?: string | null) {
  const query = useQuery<ShareTypeOption[]>({
    queryKey: ["building-share-types", buildingId || "global"],
    queryFn: async () => {
      const base: ShareTypeOption[] = SHARE_TYPES.map((s) => ({ value: s.value, label: s.label }));
      if (!buildingId) return base;

      const [catalogRes, sharesRes] = await Promise.all([
        supabase
          .from("building_share_types")
          .select("value, label")
          .eq("building_id", buildingId),
        supabase
          .from("contact_building_shares")
          .select("share_type, contact_building_assignments!inner(building_id)")
          .eq("contact_building_assignments.building_id", buildingId),
      ]);

      const seen = new Set(base.map((o) => o.value.toLowerCase()));
      const customs: ShareTypeOption[] = [];

      for (const row of (catalogRes.data as any[]) || []) {
        const v = (row.value || "").trim();
        if (!v) continue;
        const k = v.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        customs.push({ value: v, label: row.label || getShareTypeLabel(v), custom: true });
      }
      for (const row of (sharesRes.data as any[]) || []) {
        const v = (row.share_type || "").trim();
        if (!v) continue;
        const k = v.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        customs.push({ value: v, label: getShareTypeLabel(v), custom: true });
      }
      customs.sort((a, b) => a.label.localeCompare(b.label, "de"));
      return [...base, ...customs];
    },
  });

  const options: ShareTypeOption[] = (() => {
    const data = query.data || SHARE_TYPES.map((s) => ({ value: s.value, label: s.label }));
    if (!currentValue) return data;
    if (data.some((o) => o.value === currentValue)) return data;
    return [
      ...data,
      { value: currentValue, label: `${getShareTypeLabel(currentValue)} (nicht im Gebäude gepflegt)`, stale: true },
    ];
  })();

  return { ...query, options };
}
