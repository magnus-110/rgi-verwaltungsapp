/**
 * Helper-Funktionen für das Nebenkosten-Tool (Eigentümer-Sicht).
 *
 * billing_periods, bookings und chart_of_accounts sind admin-only via RLS.
 * Deshalb laufen die Zugriffe über Edge Functions (Service Role + manuelle
 * Ownership-Prüfung über contact_building_assignments).
 */
import { supabase } from "@/integrations/supabase/client";

export type FinalizedPeriod = {
  id: string;
  building_id: string;
  fiscal_year: number;
  period_from: string;
  period_to: string;
  status: string;
};

export type AutoPosition = {
  account_number: string;
  account_name: string;
  total_amount: number;
  share_amount: number;
  distribution_key: string;
  consumption_based?: boolean;
};

export type HeatingPosition = {
  label: string;
  amount: number;
  source: "messdienst" | "missing";
  note: string | null;
};

export type OwnerBillingResult = {
  positions: AutoPosition[];
  heating: HeatingPosition;
  mea_share: number;
  qm_share: number;
  own_qm: number;
  total_qm: number;
  einheiten_share: number;
  unit_count: number;
};

export async function loadFinalizedPeriods(buildingId: string): Promise<FinalizedPeriod[]> {
  const { data, error } = await supabase.functions.invoke("list-finalized-periods", {
    body: { building_id: buildingId },
  });
  if (error) throw error;
  return (data?.periods ?? []) as FinalizedPeriod[];
}

export async function getOwnerBillingPositions(
  assignmentId: string,
  periodId: string,
  distributionMode: "weg" | "qm" = "weg",
): Promise<OwnerBillingResult> {
  const { data, error } = await supabase.functions.invoke("get-owner-billing-positions", {
    body: { assignment_id: assignmentId, period_id: periodId, distribution_mode: distributionMode },
  });
  if (error) throw error;
  return {
    positions: (data?.positions ?? []) as AutoPosition[],
    heating: (data?.heating ?? {
      label: "Heizung / Warmwasser / Wasser (Messdienst)",
      amount: 0,
      source: "missing",
      note: null,
    }) as HeatingPosition,
    mea_share: Number(data?.mea_share ?? 0),
    qm_share: Number(data?.qm_share ?? 0),
    own_qm: Number(data?.own_qm ?? 0),
    total_qm: Number(data?.total_qm ?? 0),
    einheiten_share: Number(data?.einheiten_share ?? 0),
    unit_count: Number(data?.unit_count ?? 0),
  };
}
