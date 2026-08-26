import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ContractFee, ContractWithDetails, ManagementContract } from "@/types/rgiContracts";

// Die generierte types.ts im Repo ist veraltet und kennt die neuen
// Tabellen nicht. Bis sie neu erzeugt wird, greifen wir hier ungetypt
// zu und verlassen uns auf die Interfaces aus @/types/rgiContracts.
const db = supabase as any;

const KEY = ["rgi", "contracts"] as const;

/** Alle Verträge mit Gebäudedaten und Honorarbausteinen. */
export function useManagementContracts() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ContractWithDetails[]> => {
      const { data, error } = await db
        .from("management_contracts")
        .select(
          "*, building:buildings(id, name, building_code, management_mode, unit_count, city), fees:management_contract_fees(*)"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as ContractWithDetails[];
      // Bausteine stabil sortieren, damit die Reihenfolge nicht springt.
      for (const r of rows) {
        r.fees = (r.fees ?? []).sort(
          (a, b) => (a.position ?? 0) - (b.position ?? 0) || a.label.localeCompare(b.label, "de")
        );
      }
      return rows.sort((a, b) =>
        (a.building?.name ?? "").localeCompare(b.building?.name ?? "", "de")
      );
    },
  });
}

/** Gebäude, für die noch kein Vertrag erfasst ist. */
export function useBuildingsWithoutContract() {
  return useQuery({
    queryKey: ["rgi", "contracts", "missing"],
    queryFn: async () => {
      const [{ data: buildings, error: bErr }, { data: contracts, error: cErr }] = await Promise.all([
        db.from("buildings").select("id, name, building_code, management_mode, unit_count, city").order("name"),
        db.from("management_contracts").select("building_id"),
      ]);
      if (bErr) throw bErr;
      if (cErr) throw cErr;
      const covered = new Set((contracts ?? []).map((c: any) => c.building_id));
      return (buildings ?? []).filter((b: any) => !covered.has(b.id));
    },
  });
}

export function useUpsertContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ManagementContract>) => {
      const { data, error } = await db
        .from("management_contracts")
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as ManagementContract;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rgi", "contracts"] });
      toast.success("Vertrag gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("management_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rgi", "contracts"] });
      toast.success("Vertrag gelöscht");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/** Ersetzt alle Bausteine eines Vertrags durch die übergebene Liste. */
export function useSaveContractFees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contractId, fees }: { contractId: string; fees: Partial<ContractFee>[] }) => {
      const { error: delErr } = await db
        .from("management_contract_fees")
        .delete()
        .eq("contract_id", contractId);
      if (delErr) throw delErr;
      if (!fees.length) return;
      const rows = fees.map((f, i) => ({
        contract_id: contractId,
        fee_type: f.fee_type || "custom",
        label: f.label || "Position",
        unit_kind: f.unit_kind ?? null,
        basis: f.basis ?? "case",
        amount: f.amount ?? null,
        percent: f.percent ?? null,
        quantity: f.quantity ?? null,
        is_gross: !!f.is_gross,
        vat_rate: f.vat_rate ?? 19,
        threshold: f.threshold ?? null,
        min_amount: f.min_amount ?? null,
        max_amount: f.max_amount ?? null,
        max_count: f.max_count ?? null,
        tier_from: f.tier_from ?? null,
        tier_to: f.tier_to ?? null,
        halved_if_supervised: !!f.halved_if_supervised,
        debtor: f.debtor ?? "community",
        role: f.role ?? null,
        position: i,
        is_active: f.is_active !== false,
        valid_from: f.valid_from ?? null,
        valid_to: f.valid_to ?? null,
        note: f.note ?? null,
      }));
      const { error } = await db.from("management_contract_fees").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rgi", "contracts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

/** Verwalterverträge, die im DMS eines Gebäudes liegen — zum Verknüpfen. */
export function useContractFilesForBuilding(buildingId: string | null | undefined) {
  return useQuery({
    queryKey: ["rgi", "contracts", "dms", buildingId],
    enabled: !!buildingId,
    queryFn: async () => {
      const { data, error } = await db
        .from("building_files")
        .select("id, display_name, created_at")
        .eq("building_id", buildingId)
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}
