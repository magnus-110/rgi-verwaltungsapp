// Typen für Verwalterverträge, Honorarbausteine, abrechenbare
// Zusatzleistungen und Angebote.
//
// Bewusst handgeschrieben statt aus src/integrations/supabase/types.ts:
// die generierte Datei ist im Repo veraltet und kennt nur einen
// Bruchteil der Tabellen. Sobald sie neu erzeugt wird, können diese
// Typen durch Tables["management_contracts"]["Row"] ersetzt werden.

export type ContractStatus = "draft" | "active" | "ended";

export type FeeUnitKind = "apartment" | "commercial" | "parking" | "other";

export type FeeBasis =
  | "unit_month"
  | "case"
  | "item_year"
  | "item"
  | "hour"
  | "claim_payout"
  | "gross_project_volume"
  | "monthly_flat"
  | "net_rent_percent"
  | "custom";

export type FeeDebtor = "community" | "owner" | "tenant";

export type BillableStatus = "detected" | "approved" | "invoiced" | "settled" | "dismissed";

export type ManagementMode = "weg" | "rent";

export interface ManagementContract {
  id: string;
  building_id: string;
  status: ContractStatus;
  label: string | null;
  appointed_from: string | null;
  appointed_until: string | null;
  resolution_date: string | null;
  resolution_ref: string | null;
  parking_billed_separately: boolean;
  units_apartment: number | null;
  units_commercial: number | null;
  units_parking: number | null;
  units_other: number | null;
  index_base_month: string | null;
  index_base_value: number | null;
  index_lock_months: number | null;
  index_last_applied: string | null;
  self_debit_day: number | null;
  payment_interval: string | null;
  template_version: string | null;
  approval_limit_amount: number | null;
  approval_limit_note: string | null;
  termination_note: string | null;
  dms_file_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractFee {
  id: string;
  contract_id: string;
  fee_type: string;
  label: string;
  unit_kind: FeeUnitKind | null;
  basis: FeeBasis;
  amount: number | null;
  percent: number | null;
  quantity: number | null;
  is_gross: boolean;
  vat_rate: number;
  threshold: number | null;
  min_amount: number | null;
  max_amount: number | null;
  max_count: number | null;
  debtor: FeeDebtor;
  role: string | null;
  position: number;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  note: string | null;
  /** Staffelstufe: Untergrenze der Bemessungsgrundlage. */
  tier_from?: number | null;
  /** Staffelstufe: Obergrenze, null = nach oben offen. */
  tier_to?: number | null;
  /** Halbiert sich, wenn ein Sonderfachmann die Objektüberwachung führt. */
  halved_if_supervised?: boolean | null;
}

/** Ein Vertrag samt Gebäudedaten und Bausteinen, wie ihn die Übersicht braucht. */
export interface ContractWithDetails extends ManagementContract {
  building?: {
    id: string;
    name: string;
    building_code: string | null;
    management_mode: ManagementMode;
    unit_count: number | null;
    city: string | null;
  } | null;
  fees?: ContractFee[];
}

// ---------------------------------------------------------------
// Beschriftungen
// ---------------------------------------------------------------

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  ended: "Beendet",
};

export const FEE_UNIT_KIND_LABEL: Record<FeeUnitKind, string> = {
  apartment: "Wohneinheit",
  commercial: "Teileigentum",
  parking: "Garage / Stellplatz",
  other: "Sonstige",
};

export const FEE_BASIS_LABEL: Record<FeeBasis, string> = {
  unit_month: "€ je Einheit / Monat",
  monthly_flat: "€ Pauschale / Monat",
  net_rent_percent: "% der Nettomiete",
  case: "€ je Vorgang",
  item_year: "€ je Stück / Jahr",
  item: "€ je Stück",
  hour: "€ je Stunde",
  claim_payout: "% der Entschädigungssumme",
  gross_project_volume: "% des Bruttobauvolumens",
  custom: "frei",
};

export const FEE_DEBTOR_LABEL: Record<FeeDebtor, string> = {
  community: "Gemeinschaft",
  owner: "einzelner Eigentümer",
  tenant: "Mieter",
};

export const BILLABLE_STATUS_LABEL: Record<BillableStatus, string> = {
  detected: "Erkannt",
  approved: "Geprüft",
  invoiced: "Abgerechnet",
  settled: "Erledigt",
  dismissed: "Verworfen",
};

/** Prozentbasierte Bausteine brauchen ein Prozentfeld statt eines Betrags. */
export const PERCENT_BASES: FeeBasis[] = ["claim_payout", "gross_project_volume", "net_rent_percent"];

export function isPercentBasis(basis: FeeBasis): boolean {
  return PERCENT_BASES.includes(basis);
}

// ---------------------------------------------------------------
// Baustein-Katalog
//
// Nur Vorschläge für die Erfassung. Beträge stehen absichtlich
// nicht drin — die kommen aus dem jeweiligen Vertrag.
// ---------------------------------------------------------------

export interface FeeCatalogEntry {
  fee_type: string;
  label: string;
  basis: FeeBasis;
  unit_kind?: FeeUnitKind;
  debtor?: FeeDebtor;
  hint?: string;
  modes: ManagementMode[];
}

export const FEE_CATALOG: FeeCatalogEntry[] = [
  // Grundvergütung
  { fee_type: "base", label: "Grundvergütung Wohneinheiten", basis: "unit_month", unit_kind: "apartment", modes: ["weg", "rent"] },
  { fee_type: "base", label: "Grundvergütung Teileigentum", basis: "unit_month", unit_kind: "commercial", modes: ["weg"] },
  { fee_type: "base", label: "Grundvergütung Garagen / Stellplätze", basis: "unit_month", unit_kind: "parking", modes: ["weg", "rent"], hint: "Nur anlegen, wenn der Vertrag Stellplätze separat vergütet." },
  { fee_type: "base", label: "Grundvergütung Sonstige", basis: "unit_month", unit_kind: "other", modes: ["weg", "rent"] },
  { fee_type: "base_flat", label: "Monatspauschale", basis: "monthly_flat", modes: ["weg", "rent"] },
  { fee_type: "base_rent_pct", label: "Anteil der Nettomiete", basis: "net_rent_percent", modes: ["rent"] },

  // Zusatzleistungen WEG
  { fee_type: "owner_change", label: "Eigentümerwechsel inkl. Verwalterzustimmung", basis: "case", debtor: "owner", modes: ["weg"] },
  { fee_type: "cert_35a", label: "Bescheinigung nach § 35a EStG", basis: "item_year", modes: ["weg"] },
  { fee_type: "extra_meeting", label: "Außerordentliche Eigentümerversammlung", basis: "case", modes: ["weg"] },
  { fee_type: "insurance_pct", label: "Versicherungsschaden", basis: "claim_payout", modes: ["weg", "rent"], hint: "Mindestbetrag und Aufwandsschwelle im Vertrag prüfen." },
  { fee_type: "construction_pct", label: "Bauprojekt / Instandsetzung", basis: "gross_project_volume", modes: ["weg", "rent"], hint: "Bemessung ist das Bruttogesamtvolumen aller Gewerke." },
  { fee_type: "hourly", label: "Zeithonorar", basis: "hour", modes: ["weg", "rent"] },
  { fee_type: "reminder", label: "Mahnung", basis: "item", debtor: "owner", modes: ["weg", "rent"], hint: "Vertragliche Obergrenze eintragen, meist drei je Schuldner." },
  { fee_type: "key", label: "Ersatzschlüssel", basis: "item", debtor: "owner", modes: ["weg", "rent"] },
  { fee_type: "copies", label: "Kopien und Dateien", basis: "item", modes: ["weg", "rent"] },

  // Zusatzleistungen Mietverwaltung
  { fee_type: "new_letting", label: "Neuvermietung", basis: "case", modes: ["rent"] },
  { fee_type: "utility_billing", label: "Nebenkostenabrechnung", basis: "item_year", modes: ["rent"] },
  { fee_type: "rent_increase", label: "Mietanpassung", basis: "case", modes: ["rent"] },
];

/**
 * Klartext-Einheit hinter dem Betragsfeld, damit im Formular niemand
 * wissen muss, was „Bemessung“ bedeutet.
 */
export const BASIS_SUFFIX: Record<FeeBasis, string> = {
  unit_month: "€ je Einheit im Monat",
  monthly_flat: "€ im Monat",
  net_rent_percent: "% der Nettomiete",
  case: "€ je Vorgang",
  item_year: "€ je Stück und Jahr",
  item: "€ je Stück",
  hour: "€ je Stunde",
  claim_payout: "% der Schadenssumme",
  gross_project_volume: "% der Bausumme",
  custom: "€",
};

/** Auswahl für freie Positionen, in Alltagssprache. */
export const BASIS_CHOICES: { value: FeeBasis; label: string }[] = [
  { value: "case", label: "Ein Betrag je Vorgang" },
  { value: "item", label: "Ein Betrag je Stück" },
  { value: "item_year", label: "Ein Betrag je Stück und Jahr" },
  { value: "hour", label: "Ein Betrag je Stunde" },
  { value: "monthly_flat", label: "Ein Betrag jeden Monat" },
  { value: "gross_project_volume", label: "Ein Prozentsatz der Bausumme" },
  { value: "claim_payout", label: "Ein Prozentsatz der Schadenssumme" },
  { value: "net_rent_percent", label: "Ein Prozentsatz der Nettomiete" },
];

// ---------------------------------------------------------------
// Standardwerte aus dem aktuellen RGI-Verwaltervertrag
//
// Damit lässt sich ein neuer Vertrag mit einem Klick vorbelegen und
// danach anpassen. Quelle: „Verwaltervertrag für Wohnungseigentums-
// anlagen“, Fassung 2026, §§ 3 und 4.
// ---------------------------------------------------------------

export interface StandardFee {
  fee_type: string;
  label: string;
  basis: FeeBasis;
  amount?: number;
  percent?: number;
  is_gross: boolean;
  debtor?: FeeDebtor;
  threshold?: number;
  min_amount?: number;
  max_count?: number;
  tier_from?: number;
  tier_to?: number;
  halved_if_supervised?: boolean;
  role?: string;
  note?: string;
}

export const RGI_STANDARD_FEES: StandardFee[] = [
  { fee_type: "extra_meeting", label: "Außerordentliche Eigentümerversammlung", basis: "case", amount: 250, is_gross: false, note: "§ 4 Ziff. 1, Auslagen gesondert" },
  { fee_type: "key", label: "Ersatzschlüssel, Bearbeitungspauschale", basis: "item", amount: 25, is_gross: false, debtor: "owner", note: "§ 4 Ziff. 2, zzgl. Lieferantenrechnung" },
  { fee_type: "owner_change", label: "Eigentümerwechsel inkl. Verwalterzustimmung", basis: "case", amount: 250, is_gross: false, debtor: "owner", note: "§ 4 Ziff. 3" },
  { fee_type: "insurance_pct", label: "Versicherungsschaden", basis: "claim_payout", percent: 5, min_amount: 250, is_gross: false, note: "§ 4 Ziff. 4, ab drei Arbeitsstunden oder Vor-Ort-Termin" },
  { fee_type: "cert_35a", label: "Bescheinigung nach § 35a EStG", basis: "item_year", amount: 10, is_gross: false, note: "§ 4 Ziff. 5, je Einzelaufstellung" },
  { fee_type: "construction_pct", label: "Bauprojekt, Stufe 1", basis: "gross_project_volume", percent: 5, threshold: 5000, min_amount: 250, tier_from: 0, tier_to: 25000, is_gross: false, halved_if_supervised: true, note: "§ 4 Ziff. 8, bis 25.000 €" },
  { fee_type: "construction_pct", label: "Bauprojekt, Stufe 2", basis: "gross_project_volume", percent: 4, threshold: 5000, tier_from: 25000, tier_to: 100000, is_gross: false, halved_if_supervised: true, note: "§ 4 Ziff. 8, 25.000 bis 100.000 €" },
  { fee_type: "construction_pct", label: "Bauprojekt, Stufe 3", basis: "gross_project_volume", percent: 2.5, threshold: 5000, tier_from: 100000, is_gross: false, halved_if_supervised: true, note: "§ 4 Ziff. 8, über 100.000 €" },
  { fee_type: "hourly", label: "Zeithonorar", basis: "hour", amount: 70, is_gross: false, role: "management", note: "§ 4 Ziff. 13" },
];

/** Wieviele Beiratssitzungen pro Jahr die Pauschale abdeckt. */
export const RGI_STANDARD_BOARD_MEETINGS = 4;
/** Freigabegrenze für Eigenaufträge nach § 3 Abs. 2. */
export const RGI_STANDARD_APPROVAL_LIMIT = 1500;

// ---------------------------------------------------------------
// Rechnen und Formatieren
// ---------------------------------------------------------------

export function toNet(amount: number, isGross: boolean, vatRate: number): number {
  if (!isGross) return amount;
  return amount / (1 + (vatRate ?? 0) / 100);
}

/** Grundvergütung netto pro Monat aus den Bausteinen eines Vertrags. */
export function monthlyNet(fees: ContractFee[] | undefined): number {
  if (!fees?.length) return 0;
  return fees.reduce((sum, f) => {
    if (!f.is_active) return sum;
    if (f.basis === "unit_month") {
      return sum + toNet(Number(f.amount ?? 0), f.is_gross, Number(f.vat_rate)) * Number(f.quantity ?? 0);
    }
    if (f.basis === "monthly_flat") {
      return sum + toNet(Number(f.amount ?? 0), f.is_gross, Number(f.vat_rate));
    }
    return sum;
  }, 0);
}

export function formatEur(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}.${m}.${y}`;
}

/** Monate bis zum Ende der Bestellung. null = unbefristet oder ohne Datum. */
export function monthsUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (isNaN(end.getTime())) return null;
  const now = new Date();
  return (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
}

export type ContractWarning = { level: "warn" | "crit"; text: string };

/** Hinweise auf unvollständige oder widersprüchliche Vertragsdaten. */
export function contractWarnings(c: ContractWithDetails): ContractWarning[] {
  const out: ContractWarning[] = [];
  if (!c.appointed_from) {
    out.push({ level: "crit", text: "Bestellungsbeginn fehlt" });
  }
  if (c.appointed_from && c.appointed_until && c.appointed_until < c.appointed_from) {
    out.push({ level: "crit", text: "Bestellungsende liegt vor dem Beginn" });
  }
  if (!c.appointed_until) {
    out.push({ level: "warn", text: "Kein Bestellungsende erfasst" });
  }
  if (!(c.fees ?? []).some((f) => f.basis === "unit_month" || f.basis === "monthly_flat")) {
    out.push({ level: "crit", text: "Keine Grundvergütung erfasst" });
  }
  const parkingFee = (c.fees ?? []).find((f) => f.basis === "unit_month" && f.unit_kind === "parking");
  if (parkingFee && !parkingFee.quantity) {
    out.push({ level: "warn", text: "Stellplatzanzahl fehlt" });
  }
  if (c.parking_billed_separately && !parkingFee) {
    out.push({ level: "warn", text: "Stellplätze als separat vergütet markiert, aber kein Baustein dafür" });
  }
  const months = monthsUntil(c.appointed_until);
  if (months !== null && months <= 12 && months >= 0) {
    out.push({ level: "warn", text: `Bestellung endet in ${months} Monat${months === 1 ? "" : "en"}` });
  }
  if (months !== null && months < 0) {
    out.push({ level: "crit", text: "Bestellungszeitraum ist abgelaufen" });
  }
  if (c.index_base_month && c.index_lock_months) {
    const base = new Date(c.index_last_applied ?? c.index_base_month);
    const unlock = new Date(base);
    unlock.setMonth(unlock.getMonth() + c.index_lock_months);
    if (unlock <= new Date()) {
      out.push({ level: "warn", text: "Sperrfrist für die Indexanpassung ist abgelaufen" });
    }
  }
  return out;
}
