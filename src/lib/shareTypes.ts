/**
 * Zentrale Liste der Anteils-/Verteilerschlüssel.
 *
 * IDENTISCH zur Liste, die im Personen-Tab unter "Anteile" verfügbar ist
 * (siehe BuildingContactsList SHARE_TYPES). Wird sowohl beim Anlegen von
 * Anteilen pro Person als auch im Kontenrahmen-Verteilerschlüssel-Dropdown
 * verwendet, damit beide Listen 1:1 übereinstimmen.
 *
 * Der `value` ist der String, wie er in der DB (contact_building_shares.share_type
 * bzw. chart_of_accounts.default_distribution_key) gespeichert wird.
 */
export const SHARE_TYPES: { value: string; label: string }[] = [
  { value: "mea", label: "MEA" },
  { value: "Whg.-MEA", label: "Whg.-MEA" },
  { value: "Gar.-MEA", label: "Gar.-MEA" },
  { value: "Sonder-MEA", label: "Sonder-MEA" },
  { value: "einheit", label: "Einheiten" },
  { value: "qm", label: "Quadratmeter" },
  { value: "personen", label: "Personen" },
  { value: "garagen", label: "Garagen" },
  { value: "stellplaetze", label: "Stellplätze" },
  { value: "wasser", label: "Wasser" },
  { value: "warmwasser", label: "Warmwasser" },
  { value: "heizkosten", label: "Heizkosten" },
  { value: "verbrauch_wasser", label: "Verbrauch Wasser" },
  { value: "heizkostenverordnung", label: "Heizkostenverordnung" },
  { value: "direkt", label: "Direktzuordnung" },
];

const LABEL_BY_VALUE: Record<string, string> = SHARE_TYPES.reduce((acc, t) => {
  acc[t.value.toLowerCase()] = t.label;
  return acc;
}, {} as Record<string, string>);

// Häufige Aliase aus Altdaten
const ALIASES: Record<string, string> = {
  einheiten: "Einheiten",
  units: "Einheiten",
  heizk_abr: "Heizk.Abr",
  "heizk.abr": "Heizk.Abr",
  verbrauch_heizung: "Heizk.Abr",
  heating_individual: "Heizk.Abr",
};

export function getShareTypeLabel(value?: string | null): string {
  if (!value) return "MEA";
  const k = String(value).toLowerCase();
  return LABEL_BY_VALUE[k] || ALIASES[k] || value;
}
