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
};

export async function loadFinalizedPeriods(
  buildingId: string,
): Promise<FinalizedPeriod[]> {
  const { data, error } = await supabase.functions.invoke(
    "list-finalized-periods",
    { body: { building_id: buildingId } },
  );
  if (error) throw error;
  return (data?.periods ?? []) as FinalizedPeriod[];
}

export async function getOwnerBillingPositions(
  assignmentId: string,
  periodId: string,
): Promise<AutoPosition[]> {
  const { data, error } = await supabase.functions.invoke(
    "get-owner-billing-positions",
    { body: { assignment_id: assignmentId, period_id: periodId } },
  );
  if (error) throw error;
  return (data?.positions ?? []) as AutoPosition[];
}
