import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

// ---------------------------------------------------------------------
// Jahre ohne Versammlung in der App (z. B. von der Vorverwaltung abgehalten)
// ---------------------------------------------------------------------

export type EtvExemptionReason = "extern" | "sonstiges";

export interface EtvYearExemption {
  building_id: string;
  year: number;
  reason: EtvExemptionReason;
  note: string | null;
  created_at: string;
}

export const EXEMPTION_REASON_LABEL: Record<EtvExemptionReason, string> = {
  extern: "Außerhalb der App abgehalten (Vorverwaltung / vor Einführung der App)",
  sonstiges: "Sonstiger Grund",
};

export const useEtvYearExemptions = () =>
  useQuery({
    queryKey: ["etv-year-exemptions"],
    queryFn: async () => {
      const { data, error } = await db.from("etv_year_exemptions").select("building_id, year, reason, note, created_at");
      if (error) throw error;
      return (data || []) as EtvYearExemption[];
    },
  });

export const setEtvYearExemption = async (buildingId: string, year: number, reason: EtvExemptionReason, note: string | null) => {
  const { error } = await db
    .from("etv_year_exemptions")
    .upsert({ building_id: buildingId, year, reason, note: note?.trim() || null }, { onConflict: "building_id,year" });
  if (error) throw error;
};

export const removeEtvYearExemption = async (buildingId: string, year: number) => {
  const { error } = await db.from("etv_year_exemptions").delete().eq("building_id", buildingId).eq("year", year);
  if (error) throw error;
};
