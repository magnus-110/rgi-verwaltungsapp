import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VendorAlias {
  id: string;
  building_id: string | null;
  raw_pattern: string;
  display_name: string;
}

/**
 * Resolves a raw vendor name (from invoice OCR / briefkopf) to a short
 * display name based on saved vendor_aliases.
 *
 * Matching:
 *  - Building-specific aliases beat global aliases.
 *  - raw_pattern is treated as case-insensitive substring (also supports %
 *    wildcards if explicitly used).
 *  - First match wins; aliases are expected to be small in number.
 */
export function resolveVendorDisplayName(
  rawVendor: string | null | undefined,
  buildingId: string | null | undefined,
  aliases: VendorAlias[] | undefined,
): string {
  const raw = (rawVendor || "").trim();
  if (!raw || !aliases?.length) return raw;
  const rawLower = raw.toLowerCase();

  const matches = (alias: VendorAlias) => {
    const pat = alias.raw_pattern.trim().toLowerCase();
    if (!pat) return false;
    if (pat.includes("%")) {
      // % wildcard → convert to regex
      const re = new RegExp(
        "^" + pat.split("%").map(escapeRegex).join(".*") + "$",
        "i",
      );
      return re.test(rawLower);
    }
    return rawLower.includes(pat);
  };

  // Building-specific first
  if (buildingId) {
    const hit = aliases.find(a => a.building_id === buildingId && matches(a));
    if (hit) return hit.display_name;
  }
  // Global
  const hitGlobal = aliases.find(a => a.building_id == null && matches(a));
  if (hitGlobal) return hitGlobal.display_name;

  return raw;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function useVendorAliases() {
  return useQuery({
    queryKey: ["vendor-aliases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_aliases")
        .select("id, building_id, raw_pattern, display_name");
      if (error) throw error;
      return (data || []) as VendorAlias[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
