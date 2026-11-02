// Vorgaben für Angebote und Verwalterverträge – gemeinsam für App und Edge Functions
// (App: über @shared/angebot-vorgaben.ts, z. B. in src/types/rgiContracts.ts und im Angebots-Assistenten;
// Edge Functions: rgi-connector). Hier ändern, dann gilt es überall.

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
// Laufzeit der Bestellung
//
// § 26 Abs. 2 WEG: Die Bestellung des Verwalters ist auf höchstens
// fünf Jahre zulässig, bei der ersten Bestellung nach Begründung
// der Wohnungseigentümergemeinschaft auf höchstens drei Jahre.
// ---------------------------------------------------------------

/** Standardlaufzeit der Bestellung in Jahren. */
export const DEFAULT_TERM_YEARS = 3;

/** Zur Auswahl stehende Laufzeiten in Jahren. */
export const TERM_YEAR_CHOICES = [1, 2, 3, 4, 5] as const;

const TERM_YEAR_WORDS: Record<number, string> = {
  1: "einem Jahr",
  2: "zwei Jahren",
  3: "drei Jahren",
  4: "vier Jahren",
  5: "fünf Jahren",
};

/** Laufzeit im Dativ, wie sie der Vertragstext braucht („drei Jahren“). */
export function termYearsWord(years: number | null | undefined): string {
  const n = Number(years);
  if (!Number.isFinite(n) || n <= 0) return "";
  return TERM_YEAR_WORDS[n] ?? `${n} Jahren`;
}

/**
 * Laufzeit als Zahl. Nimmt eine Zahl direkt, versteht aber auch die alte
 * Textform („drei Jahren“) aus Angeboten vor der Umstellung.
 */
export function parseTermYears(value: unknown): number | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  if (Number.isFinite(n) && n > 0) return n;
  const words: Record<string, number> = {
    einem: 1, eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4,
    "fünf": 5, fuenf: 5, sechs: 6,
  };
  const m = s.toLowerCase().match(/(einem|eins|ein|zwei|drei|vier|fünf|fuenf|sechs)/);
  return m ? words[m[1]] ?? null : null;
}

/** Laufzeit kurz für das Übersichtsblatt („3 Jahre“). */
export function termYearsShort(years: number | null | undefined): string {
  const n = Number(years);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n === 1 ? "1 Jahr" : `${n} Jahre`;
}

/**
 * Wandelt einen Datumswert in ISO (YYYY-MM-DD). Akzeptiert ISO und das
 * deutsche Format „31.12.2029“. Alles andere ergibt null.
 */
export function toIsoDate(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) return `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
  return null;
}

/**
 * Ende der Bestellung: Beginn plus Laufzeit minus einen Tag, damit der
 * Zeitraum genau die Laufzeit umfasst — 01.01.2027 über drei Jahre endet
 * am 31.12.2029. Rückgabe in ISO, leer wenn Beginn oder Laufzeit fehlt.
 */
export function contractEndDate(
  startIso: string | null | undefined,
  years: number | null | undefined,
): string {
  const start = toIsoDate(startIso);
  const n = Number(years);
  if (!start || !Number.isFinite(n) || n <= 0) return "";
  const [y, m, d] = start.split("-").map(Number);
  // Bewusst in UTC gerechnet, damit keine Zeitzone den Tag verschiebt.
  const end = new Date(Date.UTC(y + n, m - 1, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/**
 * Standardwerte des aktuellen RGI-Verwaltervertrags, die nicht als
 * Position geführt werden. Landen in offers.contract_defaults und
 * von dort in die Platzhalter der Word-Vorlage.
 */
export const ANGEBOT_VERTRAGSWERTE: Record<string, string> = {
  // Laufzeit der Bestellung in Jahren. Daraus entstehen der Vertragstext
  // ('laufzeit.jahre'), die Angabe auf dem Uebersichtsblatt
  // ('uebersicht.laufzeit') und das Enddatum ('bestellung.bis').
  "laufzeit.jahre_anzahl": String(DEFAULT_TERM_YEARS),
  "freigabe.grenze": "1.500,00",
  "freigabe.beirat_ab": "750,00",
  "zuschlag.ohne_sepa": "5,00",
  "entnahme.werktag": "3",
  "beirat.sitzungen_inklusive": "vier",
  "index.basisjahr": "2020",
  "ort": "Pfronten",
  "extrakosten":
    "Zusatzkosten entstehen nur bei Sonderfällen wie z. B. Eigentümerwechsel, außerordentliche " +
    "Versammlungen, aufwendige Versicherungsschäden, Bauprojekte ab 5000€ oder Rechtsangelegenheiten. " +
    "Abgerechnet wird pauschal, prozentual oder nach Zeitaufwand – je nach Sonderfall.",
};

/**
 * Vertragswerte eines Angebots, wie sie gespeichert und an die Vorlage gehen:
 * Laufzeit-Texte und Ende der Bestellung werden aus Beginn und Laufzeit berechnet –
 * wie im Angebots-Assistenten. Ein von Hand gesetztes Ende (bestellungBis) bleibt.
 */
export function angebotVertragswerte(
  werte: Record<string, string>,
  beginn: string | null | undefined,
  bestellungBis?: string | null,
): Record<string, string> {
  const jahre = parseTermYears(werte["laufzeit.jahre_anzahl"]) ?? parseTermYears(werte["laufzeit.jahre"]) ?? DEFAULT_TERM_YEARS;
  return {
    ...werte,
    "laufzeit.jahre_anzahl": String(jahre),
    "laufzeit.jahre": termYearsWord(jahre),
    "uebersicht.laufzeit": termYearsShort(jahre),
    "bestellung.bis": toIsoDate(bestellungBis) ?? contractEndDate(beginn, jahre),
  };
}
