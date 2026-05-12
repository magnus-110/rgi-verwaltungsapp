/**
 * §35a Bescheinigung – Verteilungs-Logik
 *
 * Quelle: Buchungen mit gesetzter §35a-Position (`is_35a_relevant=true` oder `amount_35a` gesetzt).
 * Verteilung pro Aufwandskonto nach `chart_of_accounts.default_distribution_key`.
 */

export type DistributionKey =
  | "mea"
  | "einheit"
  | "einheiten"
  | "qm"
  | "personen"
  | "stellplaetze"
  | "heizk_abr";

export type Type35a = "dienste" | "handwerker";

export interface AccountInfo {
  id: string;
  account_number: string;
  account_name: string;
  default_distribution_key: DistributionKey | string | null;
  is_35a_relevant?: boolean | null;
  settlement_35a_type?: Type35a | string | null;
  default_vat_rate?: number | null;
}

export interface BookingRow {
  id: string;
  booking_date: string;
  description: string | null;
  amount: number | string;
  amount_35a: number | string | null;
  is_35a_relevant: boolean | null;
  account_id: string | null;
  counter_account_id: string | null;
  invoice_id?: string | null;
  invoices?: {
    invoice_number?: string | null;
    invoice_date?: string | null;
    vendor_name?: string | null;
    line_items_detail?: any;
    vat_rate?: number | null;
  } | null;
}

export interface OwnerAssignment {
  id: string;
  contact_id: string | null;
  unit_number: string | null;
  floor_location: string | null;
  unit_kind: string | null;
  billing_mode: string | null;
  parent_assignment_id: string | null;
  area_sqm_override: number | null;
  contacts: {
    salutation?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
    address_street?: string | null;
    address_zip?: string | null;
    address_city?: string | null;
  } | null;
  contact_building_shares?: { share_type: string; share_value: number }[];
  // Override-Felder
  salutation_override?: string | null;
  first_name_override?: string | null;
  last_name_override?: string | null;
  company_name_override?: string | null;
  address_street_override?: string | null;
  address_zip_override?: string | null;
  address_city_override?: string | null;
}

export interface HeatingShareLookup {
  // assignment_id -> amount (Brunata-Verbrauchswert für Periode)
  [assignmentId: string]: number;
}

export const DISTRIBUTION_LABELS: Record<string, string> = {
  mea: "Miteigentumsanteile (MEA)",
  einheit: "je Einheit",
  einheiten: "je Einheit",
  qm: "Wohnfläche (m²)",
  personen: "Personen",
  stellplaetze: "Stellplätze",
  heizk_abr: "Heizkostenabrechnung",
};

export function isSecondaryUnit(a: OwnerAssignment): boolean {
  return a.billing_mode === "distribution_only" || (a.unit_kind != null && a.unit_kind !== "apartment");
}

export function shareValue(a: OwnerAssignment, type: string): number {
  return Number(a.contact_building_shares?.find((s) => s.share_type === type)?.share_value ?? 0) || 0;
}

/** Hauptwohnungs-Eigentümer (Sub-Units herausgefiltert). */
export function getMainOwners(all: OwnerAssignment[]): OwnerAssignment[] {
  return all.filter((o) => !isSecondaryUnit(o));
}

/** Aggregiert Sub-Unit-MEA pro contact_id. */
export function getExtraMeaByContact(all: OwnerAssignment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of all) {
    if (isSecondaryUnit(a) && a.contact_id) {
      m.set(a.contact_id, (m.get(a.contact_id) || 0) + shareValue(a, "mea"));
    }
  }
  return m;
}

/** Anzahl Stellplätze pro contact_id. */
export function getStellplatzCountByContact(all: OwnerAssignment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of all) {
    if (isSecondaryUnit(a) && a.contact_id) {
      const isStellplatz = a.unit_kind === "stellplatz" || a.unit_kind === "garage" || a.unit_kind === "tiefgarage";
      if (isStellplatz) m.set(a.contact_id, (m.get(a.contact_id) || 0) + 1);
    }
  }
  return m;
}

/**
 * Anteil eines (Haupt-)Eigentümers nach Schlüssel.
 * Sub-Units werden je nach Schlüssel auf den Hauptbesitzer aufgeschlagen.
 */
export function getOwnerShare(
  owner: OwnerAssignment,
  key: string,
  ctx: {
    extraMeaByContact: Map<string, number>;
    stellplatzByContact: Map<string, number>;
    heatingShares?: HeatingShareLookup;
  },
): number {
  const k = (key || "mea").toLowerCase();
  switch (k) {
    case "mea": {
      const own = shareValue(owner, "mea");
      const extra = (owner.contact_id && ctx.extraMeaByContact.get(owner.contact_id)) || 0;
      return own + extra;
    }
    case "einheit":
    case "einheiten":
      return 1;
    case "qm":
      return Number(owner.area_sqm_override ?? shareValue(owner, "qm")) || 0;
    case "personen":
      return shareValue(owner, "personen");
    case "stellplaetze":
      return (owner.contact_id && ctx.stellplatzByContact.get(owner.contact_id)) || 0;
    case "heizk_abr":
      return ctx.heatingShares?.[owner.id] ?? 0;
    default:
      return shareValue(owner, "mea");
  }
}

/**
 * Wählt die Aufwandsseite einer Buchung.
 * Heuristik:
 *  1) Konto mit `is_35a_relevant=true`
 *  2) Konto mit gesetztem `default_distribution_key`
 *  3) Fallback: counter_account_id (Bank-zentrische Buchungen)
 */
export function pickExpenseAccountId(
  b: BookingRow,
  accounts: Map<string, AccountInfo>,
): string | null {
  const a = b.account_id ? accounts.get(b.account_id) : undefined;
  const c = b.counter_account_id ? accounts.get(b.counter_account_id) : undefined;
  if (a?.is_35a_relevant) return a.id;
  if (c?.is_35a_relevant) return c.id;
  if (a?.default_distribution_key) return a.id;
  if (c?.default_distribution_key) return c.id;
  return b.counter_account_id || b.account_id || null;
}

export function getLohnanteil(b: BookingRow): number {
  const v = b.amount_35a != null && b.amount_35a !== "" ? Number(b.amount_35a) : Number(b.amount);
  return Math.abs(v) || 0;
}

export function getGesamtbetrag(b: BookingRow): number {
  return Math.abs(Number(b.amount)) || 0;
}

export interface AccountBlock {
  account: AccountInfo;
  key: string;
  bookings: BookingRow[];
  totalGross: number;
  totalLabor: number;
  totalDistributable: number; // Σ share aller Hauptwohnungen
}

/** Gruppiert Buchungen pro Aufwandskonto. */
export function buildAccountBlocks(
  bookings: BookingRow[],
  accounts: Map<string, AccountInfo>,
  owners: OwnerAssignment[],
  ctx: Parameters<typeof getOwnerShare>[2],
): AccountBlock[] {
  const groups = new Map<string, BookingRow[]>();
  for (const b of bookings) {
    const accId = pickExpenseAccountId(b, accounts);
    if (!accId) continue;
    if (!groups.has(accId)) groups.set(accId, []);
    groups.get(accId)!.push(b);
  }

  const blocks: AccountBlock[] = [];
  for (const [accId, bs] of groups) {
    const acc = accounts.get(accId);
    if (!acc) continue;
    const key = (acc.default_distribution_key || "mea").toLowerCase();
    const totalGross = bs.reduce((s, b) => s + getGesamtbetrag(b), 0);
    const totalLabor = bs.reduce((s, b) => s + getLohnanteil(b), 0);
    const totalDistributable = owners.reduce((s, o) => s + getOwnerShare(o, key, ctx), 0);
    blocks.push({ account: acc, key, bookings: bs, totalGross, totalLabor, totalDistributable });
  }

  blocks.sort((a, b) => a.account.account_number.localeCompare(b.account.account_number));
  return blocks;
}

export interface OwnerBlockLine {
  booking: BookingRow;
  gross: number;
  labor: number;
  totalShare: number; // Σ share über alle Eigentümer dieser Schlüssel-Sicht
  ownerShare: number;
  ownerCost: number; // labor * ownerShare/totalShare
}

export interface OwnerAccountBlock {
  account: AccountInfo;
  key: string;
  lines: OwnerBlockLine[];
  subtotalGross: number;
  subtotalLabor: number;
  subtotalOwnerCost: number;
}

/** Pro Eigentümer: Liste aller Konto-Blöcke mit anteiligen Kosten je Beleg. */
export function buildOwnerCertificate(
  owner: OwnerAssignment,
  blocks: AccountBlock[],
  ctx: Parameters<typeof getOwnerShare>[2],
): { blocks: OwnerAccountBlock[]; total: number } {
  const result: OwnerAccountBlock[] = [];
  let total = 0;

  for (const block of blocks) {
    const ownerShare = getOwnerShare(owner, block.key, ctx);
    const totalShare = block.totalDistributable;

    const lines: OwnerBlockLine[] = block.bookings.map((b) => {
      const labor = getLohnanteil(b);
      const ownerCost = totalShare > 0 ? labor * (ownerShare / totalShare) : 0;
      return {
        booking: b,
        gross: getGesamtbetrag(b),
        labor,
        totalShare,
        ownerShare,
        ownerCost,
      };
    });

    const subtotalOwnerCost = lines.reduce((s, l) => s + l.ownerCost, 0);
    total += subtotalOwnerCost;

    result.push({
      account: block.account,
      key: block.key,
      lines,
      subtotalGross: block.totalGross,
      subtotalLabor: block.totalLabor,
      subtotalOwnerCost,
    });
  }

  return { blocks: result, total };
}

/** Beleg-Beschreibung im PDF-Stil: "<Beschreibung> (<Nr.>/ <Datum>/ <Lieferant>)". */
export function formatBookingLabel(b: BookingRow): string {
  const desc = (b.description || "").trim() || "Buchung";
  const inv = b.invoices;
  if (!inv) return desc;
  const parts = [
    inv.invoice_number?.trim(),
    inv.invoice_date ? formatDateDe(inv.invoice_date) : null,
    inv.vendor_name?.trim(),
  ].filter(Boolean);
  if (parts.length === 0) return desc;
  return `${desc} (${parts.join("/ ")})`;
}

export function formatDateDe(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${String(d.getFullYear()).slice(-2)}`;
}

export function ownerDisplayName(o: OwnerAssignment): string {
  const c = o.contacts || {};
  const company = o.company_name_override || c.company_name;
  if (company) return company;
  const last = o.last_name_override || c.last_name || "";
  const first = o.first_name_override || c.first_name || "";
  return `${last}, ${first}`.replace(/^,\s*|,\s*$/g, "").trim();
}

export function ownerSalutation(o: OwnerAssignment): string {
  return o.salutation_override || o.contacts?.salutation || "";
}

export function ownerAddress(o: OwnerAssignment): { street: string; zip: string; city: string } {
  return {
    street: o.address_street_override || o.contacts?.address_street || "",
    zip: o.address_zip_override || o.contacts?.address_zip || "",
    city: o.address_city_override || o.contacts?.address_city || "",
  };
}
