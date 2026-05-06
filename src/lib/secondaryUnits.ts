/**
 * Helpers für Nebeneinheiten (Stellplätze, Keller, Hobbyräume, Gartenanteile).
 *
 * Datenmodell-Kontext:
 * - Eine "Einheit" ist immer ein contact_building_assignments-Row.
 * - unit_kind unterscheidet Wohnung vs. Stellplatz/Keller/etc.
 * - billing_mode steuert die Finanz-/ETV-Logik:
 *     - 'own_billing'        → eigene Abrechnung, eigenes Hausgeld, eigene Stimme/MEA
 *     - 'distribution_only'  → MEA fließt zur Hauptwohnung des Eigentümers, KEINE eigene Abrechnungszeile,
 *                              KEINE eigene Stimme bei der ETV (MEA wird zur Wohnungsstimme addiert)
 * - parent_assignment_id verknüpft die Nebeneinheit optional mit der Hauptwohnung.
 */

export type UnitKind =
  | "apartment"
  | "commercial"
  | "parking_garage"
  | "parking_outdoor"
  | "cellar"
  | "hobby_room"
  | "garden"
  | "other";

export type BillingMode = "own_billing" | "distribution_only";

export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  apartment: "Wohnung",
  parking_garage: "TG-Stellplatz",
  parking_outdoor: "Stellplatz",
  cellar: "Keller",
  hobby_room: "Hobbyraum",
  garden: "Gartenanteil",
  other: "Sonstige Einheit",
};

export const UNIT_KIND_ICONS: Record<UnitKind, string> = {
  apartment: "",
  parking_garage: "",
  parking_outdoor: "",
  cellar: "",
  hobby_room: "",
  garden: "",
  other: "",
};

export const UNIT_KIND_OPTIONS: { value: UnitKind; label: string }[] = (
  Object.keys(UNIT_KIND_LABELS) as UnitKind[]
).map((k) => ({ value: k, label: UNIT_KIND_LABELS[k] }));

export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  own_billing: "Eigene Abrechnung",
  distribution_only: "Nur Verteilung (MEA fließt zur Hauptwohnung)",
};

export const isApartment = (kind?: string | null) =>
  !kind || kind === "apartment";

export const isSecondaryUnit = (kind?: string | null) =>
  !!kind && kind !== "apartment";

/**
 * Liefert für ein Assignment den MEA-Anteil als Zahl (0 falls keiner gepflegt).
 */
export const readMea = (a: any): number => {
  const shares: any[] = a?.contact_building_shares || a?.shares || [];
  const m = shares.find((s) => s.share_type === "mea");
  return m ? Number(m.share_value) || 0 : 0;
};

/**
 * Liefert eine Map contact_id -> Summe MEA aller distribution_only-Assignments
 * desselben Eigentümers. Diese Summe muss bei MEA-Aggregationen der Hauptwohnung
 * (own_billing) hinzugerechnet werden.
 */
export const buildDistributionOnlyMeaByContact = (
  assignments: any[]
): Map<string, number> => {
  const map = new Map<string, number>();
  for (const a of assignments) {
    if (a?.billing_mode === "distribution_only") {
      const cid = a.contact_id;
      if (!cid) continue;
      map.set(cid, (map.get(cid) || 0) + readMea(a));
    }
  }
  return map;
};

/**
 * Effektive MEA für die Verteilung/Abstimmung:
 * - Bei own_billing-Assignments: eigene MEA + alle distribution_only-MEAs desselben Eigentümers im selben Building.
 * - Bei distribution_only-Assignments: 0 (es bekommt keine eigene Verteilungszeile/Stimme).
 *
 * Erwartet eine vorberechnete Map (siehe buildDistributionOnlyMeaByContact),
 * damit Schleifen O(n) bleiben.
 */
export const effectiveMeaForAssignment = (
  assignment: any,
  distributionOnlyByContact: Map<string, number>
): number => {
  if (assignment?.billing_mode === "distribution_only") return 0;
  const own = readMea(assignment);
  const extra = distributionOnlyByContact.get(assignment?.contact_id) || 0;
  return own + extra;
};

/**
 * Liefert eine gefilterte Liste der Assignments, die in
 * Verteilungen/Abrechnungen/Stimmen als eigene Position gewertet werden.
 * (Filtert distribution_only heraus.)
 */
export const filterBillingRelevantAssignments = <T extends { billing_mode?: string | null }>(
  assignments: T[]
): T[] => assignments.filter((a) => a?.billing_mode !== "distribution_only");

/**
 * Summe der effektiven MEA über alle abrechnungsrelevanten Assignments.
 * Identisch zur Gesamtsumme aller MEA-Shares (auch der distribution_only),
 * weil deren MEA auf own_billing umgehängt wird.
 */
export const sumEffectiveMea = (assignments: any[]): number => {
  return assignments.reduce((s, a) => s + readMea(a), 0);
};
