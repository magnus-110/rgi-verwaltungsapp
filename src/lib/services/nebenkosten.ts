/**
 * Helper-Funktionen für das Nebenkosten-Tool.
 *
 * Wichtig: Diese Funktion liefert die auf die einzelne Wohnung entfallenden
 * umlagefähigen Anteile aus einer FINALISIERTEN Abrechnungsperiode (status
 * 'completed' oder 'closed'). Wir greifen NICHT mehr direkt auf bookings zu,
 * sondern auf die offizielle Abrechnung der Verwaltung.
 *
 * Aktuelle Implementierung (v1): vereinfachte Aggregation per MEA aus
 * `bookings` × `chart_of_accounts.umlagefaehig`. Die spätere Iteration sollte
 * die exakt gleiche Logik wie `generate-billing-document` / BillingSettlement
 * verwenden (TODO).
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
  total_amount: number;   // Gesamtkosten der Liegenschaft im Zeitraum
  share_amount: number;   // auf diese Wohnung entfallender Anteil
  distribution_key: string;
};

/**
 * Lädt alle finalisierten Perioden eines Gebäudes (für Eigentümer auswählbar).
 */
export async function loadFinalizedPeriods(
  buildingId: string,
): Promise<FinalizedPeriod[]> {
  const { data, error } = await supabase
    .from("billing_periods")
    .select("id, building_id, fiscal_year, period_from, period_to, status")
    .eq("building_id", buildingId)
    .in("status", ["completed", "closed"])
    .order("fiscal_year", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FinalizedPeriod[];
}

/**
 * Berechnet die auf die Wohnung entfallenden umlagefähigen Positionen
 * für eine finalisierte Periode.
 *
 * Vereinfachte v1: nutzt MEA aus `contact_building_shares` (Default Key 'mea')
 * und summiert je umlagefähigem Konto die Buchungen der Periode.
 */
export async function getOwnerBillingPositions(
  assignmentId: string,
  periodId: string,
): Promise<AutoPosition[]> {
  // 1. Periode holen
  const { data: period, error: pErr } = await supabase
    .from("billing_periods")
    .select("id, building_id, fiscal_year, period_from, period_to")
    .eq("id", periodId)
    .maybeSingle();
  if (pErr || !period) throw pErr ?? new Error("Periode nicht gefunden");

  // 2. MEA-Anteil dieser Wohnung
  const { data: shares } = await supabase
    .from("contact_building_shares")
    .select("share_type_id, share_value, building_share_types(code)")
    .eq("assignment_id", assignmentId);

  const meaRow = (shares ?? []).find(
    (s: any) => s.building_share_types?.code === "mea",
  );
  const ownMea = Number(meaRow?.share_value ?? 0);

  // Summe der MEA aller aktiven Wohnungen des Gebäudes
  const { data: allShares } = await supabase
    .from("contact_building_shares")
    .select(
      "share_value, building_share_types(code), contact_building_assignments!inner(building_id, is_active)",
    )
    .eq("building_share_types.code", "mea")
    .eq("contact_building_assignments.building_id", period.building_id)
    .eq("contact_building_assignments.is_active", true);

  const totalMea = (allShares ?? []).reduce(
    (sum: number, r: any) => sum + Number(r.share_value ?? 0),
    0,
  );
  const meaShare = totalMea > 0 ? ownMea / totalMea : 0;

  // 3. Umlagefähige Konten (ohne Reserve, ohne Heizung 1400/1410/1450)
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number, account_name, default_distribution_key")
    .eq("building_id", period.building_id)
    .eq("umlagefaehig", true)
    .eq("is_reserve_funded", false);

  if (!accounts || accounts.length === 0) return [];

  const heatingNumbers = new Set(["1400", "1410", "1450"]);
  const relevant = accounts.filter(
    (a: any) => !heatingNumbers.has(a.account_number),
  );

  // 4. Buchungen der Periode aggregieren (account_id seitig)
  const { data: bookings } = await supabase
    .from("bookings")
    .select("account_id, counter_account_id, amount, booking_date")
    .gte("booking_date", period.period_from)
    .lte("booking_date", period.period_to);

  const sums: Record<string, number> = {};
  (bookings ?? []).forEach((b: any) => {
    const acc = relevant.find(
      (r: any) => r.id === b.account_id || r.id === b.counter_account_id,
    );
    if (!acc) return;
    sums[acc.id] = (sums[acc.id] ?? 0) + Number(b.amount ?? 0);
  });

  return relevant
    .map((a: any) => {
      const total = Math.abs(sums[a.id] ?? 0);
      return {
        account_number: a.account_number,
        account_name: a.account_name,
        total_amount: round2(total),
        share_amount: round2(total * meaShare),
        distribution_key: a.default_distribution_key ?? "mea",
      };
    })
    .filter((p) => p.total_amount > 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
