import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BuildingBankAccount {
  id: string;
  building_id: string;
  iban: string;
  display_name: string | null;
  coa_account_id: string | null;
  bank_name: string | null;
  is_active: boolean;
}

/**
 * Mapping IBAN -> Konto im Kontenrahmen pro Liegenschaft.
 * Wird genutzt um Bank-Transaktionen automatisch auf das richtige
 * Bank-/Rücklagenkonto zu buchen statt hardcoded 1800.
 */
export function useBuildingBankAccounts(buildingId: string | null | undefined) {
  return useQuery({
    queryKey: ["building-bank-accounts", buildingId],
    queryFn: async (): Promise<BuildingBankAccount[]> => {
      if (!buildingId) return [];
      const { data, error } = await supabase
        .from("building_bank_accounts" as any)
        .select("*")
        .eq("building_id", buildingId);
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: !!buildingId,
  });
}
