// Typen und Rechenregeln für das Abrechnungsblatt.
//
// Das Abrechnungsblatt zeigt je Liegenschaft alles, was dort
// abrechenbar ist, und ob es schon abgerechnet wurde. Die Zeilen
// stammen aus vier Quellen, die hier zu einem einheitlichen Typ
// zusammengeführt werden:
//
//   1. Vertrag   – Honorarbausteine aus dem Verwaltervertrag
//   2. Stunden   – erfasste, noch nicht abgerechnete Projektzeiten
//   3. Vorlage   – gespeicherte Positionsvorlagen
//   4. Frei      – von Hand erfasste Posten
//
// Vorschläge aus dem Vertrag existieren nur in der Anzeige. Erst
// wenn jemand sie anhakt, werden daraus echte Datensätze. So kann
// die Automatik nie etwas abrechnen, das niemand gesehen hat.

import {
  type ContractFee,
  type ContractWithDetails,
  type FeeBasis,
  type FeeDebtor,
  type BillableStatus,
  formatEur,
  isPercentBasis,
  toNet,
} from "./rgiContracts";

// ---------------------------------------------------------------
// Datensatz aus billable_events
// ---------------------------------------------------------------

export type BillableSourceKind =
  | "contract_fee"
  | "time_entry"
  | "preset"
  | "manual"
  | "assignment"
  | "etv_meeting"
  | "case"
  | "reminder";

export interface BillableEvent {
  id: string;
  building_id: string;
  contract_id: string | null;
  fee_id: string | null;
  status: BillableStatus;
  occurred_on: string;
  label: string;
  quantity: number;
  unit: string | null;
  amount_net: number | null;
  amount_gross: number | null;
  vat_rate: number;
  debtor: FeeDebtor;
  debtor_contact_id: string | null;
  source_kind: BillableSourceKind | null;
  source_id: string | null;
  period_key: string | null;
  settled_via: string | null;
  rgi_invoice_id: string | null;
  rgi_invoice_item_id: string | null;
  settled_on: string | null;
  dismissed_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Nachgeladen, damit die Zeile die Rechnungsnummer zeigen kann. */
  invoice?: { id: string; invoice_number: string | null; issue_date: string; status: string } | null;
}

/** Eine Zeile der Objektliste (Sicht rgi_building_billing_overview). */
export interface BillingOverviewRow {
  building_id: string;
  building_name: string;
  building_code: string | null;
  city: string | null;
  management_mode: "weg" | "rent";
  contract_id: string | null;
  contract_status: string | null;
  appointed_until: string | null;
  base_monthly_net: number;
  open_count: number;
  open_net: number;
  last_invoice_number: string | null;
  last_invoice_date: string | null;
  last_invoice_gross: number | null;
}

// ---------------------------------------------------------------
// Einheitliche Zeile im Abrechnungsblatt
// ---------------------------------------------------------------

export type BillingRowOrigin = "contract" | "time" | "preset" | "manual";

export interface BillingRow {
  /** Stabiler Schlüssel für Auswahl und React-Keys. */
  key: string;
  origin: BillingRowOrigin;
  /** Gesetzt, sobald die Zeile als Datensatz existiert. */
  eventId: string | null;
  status: BillableStatus | "suggested";
  label: string;
  quantity: number;
  unit: string;
  /** Einzelpreis netto. null = muss noch eingegeben werden. */
  unitPriceNet: number | null;
  vatRate: number;
  debtor: FeeDebtor;
  feeId: string | null;
  contractId: string | null;
  periodKey: string | null;
  sourceKind: BillableSourceKind | null;
  sourceId: string | null;
  occurredOn: string;
  /** Kurzer Hinweis unter der Zeile, z. B. Vertragsstelle oder Staffel. */
  hint?: string;
  /** Prozentbaustein: Bemessungsgrundlage fehlt noch. */
  needsInput?: boolean;
  /** Für Stundenzeilen: welche Zeiterfassungen dahinterstecken. */
  timeEntryIds?: string[];
  /** Für Stundenzeilen: aus welchem Projekt sie stammen. */
  projectId?: string | null;
  projectName?: string | null;
  invoiceNumber?: string | null;
  invoiceId?: string | null;
  dismissedReason?: string | null;
}

export const ORIGIN_LABEL: Record<BillingRowOrigin, string> = {
  contract: "Vertrag",
  time: "Stunden",
  preset: "Vorlage",
  manual: "Frei",
};

export const ROW_STATUS_LABEL: Record<BillingRow["status"], string> = {
  suggested: "Vorschlag",
  detected: "Erkannt",
  approved: "Offen",
  invoiced: "Abgerechnet",
  settled: "Erledigt",
  dismissed: "Verworfen",
};

/** Zeilen, die noch abgerechnet werden können. */
export function isOpenRow(row: BillingRow): boolean {
  return row.status === "suggested" || row.status === "detected" || row.status === "approved";
}

export function rowNet(row: BillingRow): number {
  return Math.round((row.unitPriceNet ?? 0) * row.quantity * 100) / 100;
}

export function rowsNet(rows: BillingRow[]): number {
  return Math.round(rows.reduce((s, r) => s + rowNet(r), 0) * 100) / 100;
}

// ---------------------------------------------------------------
// Staffelrechnung
// ---------------------------------------------------------------

/**
 * Rechnet eine gestaffelte Prozentvergütung aus, z. B. die
 * Baubetreuung: bis 25.000 € 5,0 %, bis 100.000 € 4,0 %, darüber
 * 2,5 %. Jede Stufe ist ein eigener Baustein mit tier_from/tier_to.
 *
 * @param tiers     Bausteine desselben fee_type, Reihenfolge egal
 * @param base      Bemessungsgrundlage, z. B. die Bruttobausumme
 * @param supervised  Ein Architekt oder Sonderfachmann führt die
 *                    Objektüberwachung — halbiert die Vergütung,
 *                    sofern der Baustein das vorsieht
 */
export function computeTieredFee(
  tiers: ContractFee[],
  base: number,
  supervised = false,
): { amount: number; steps: string[] } {
  const steps: string[] = [];
  if (!tiers.length || !base || base <= 0) return { amount: 0, steps };

  const sorted = [...tiers].sort((a, b) => Number(a.tier_from ?? 0) - Number(b.tier_from ?? 0));

  // Aufwandsschwelle: unterhalb fällt gar nichts an.
  const threshold = Number(sorted[0]?.threshold ?? 0);
  if (threshold > 0 && base < threshold) {
    steps.push(`Bausumme unter der Schwelle von ${formatEur(threshold)} — keine Vergütung`);
    return { amount: 0, steps };
  }

  let total = 0;
  for (const tier of sorted) {
    const from = Number(tier.tier_from ?? 0);
    const to = tier.tier_to === null || tier.tier_to === undefined ? Infinity : Number(tier.tier_to);
    if (base <= from) continue;
    const portion = Math.min(base, to) - from;
    if (portion <= 0) continue;
    const pct = Number(tier.percent ?? 0);
    const part = (portion * pct) / 100;
    total += part;
    steps.push(
      `${formatEur(portion)} × ${pct.toLocaleString("de-DE")} % = ${formatEur(part)}`,
    );
  }

  if (supervised && sorted.some((t) => t.halved_if_supervised)) {
    total = total / 2;
    steps.push("halbiert wegen externer Objektüberwachung");
  }

  // Mindestbetrag gilt für die Gesamtvergütung, nicht je Stufe.
  const min = Math.max(0, ...sorted.map((t) => Number(t.min_amount ?? 0)));
  if (min > 0 && total < min) {
    steps.push(`Mindestbetrag ${formatEur(min)} greift`);
    total = min;
  }

  return { amount: Math.round(total * 100) / 100, steps };
}

/** Einfacher Prozentbaustein ohne Staffel, z. B. Versicherungsschaden. */
export function computePercentFee(fee: ContractFee, base: number): { amount: number; steps: string[] } {
  const steps: string[] = [];
  if (!base || base <= 0) return { amount: 0, steps };
  const threshold = Number(fee.threshold ?? 0);
  if (threshold > 0 && base < threshold) {
    steps.push(`Grundlage unter der Schwelle von ${formatEur(threshold)} — keine Vergütung`);
    return { amount: 0, steps };
  }
  const pct = Number(fee.percent ?? 0);
  let total = (base * pct) / 100;
  steps.push(`${formatEur(base)} × ${pct.toLocaleString("de-DE")} % = ${formatEur(total)}`);
  const min = Number(fee.min_amount ?? 0);
  if (min > 0 && total < min) {
    steps.push(`Mindestbetrag ${formatEur(min)} greift`);
    total = min;
  }
  const max = Number(fee.max_amount ?? 0);
  if (max > 0 && total > max) {
    steps.push(`Höchstbetrag ${formatEur(max)} greift`);
    total = max;
  }
  return { amount: Math.round(total * 100) / 100, steps };
}

// ---------------------------------------------------------------
// Vorschläge aus dem Verwaltervertrag
// ---------------------------------------------------------------

const BASE_BASES: FeeBasis[] = ["unit_month", "monthly_flat"];

/** Einheitentext für einen Baustein, in Alltagssprache. */
function unitFor(basis: FeeBasis): string {
  switch (basis) {
    case "hour": return "Std";
    case "item":
    case "item_year": return "Stück";
    case "case": return "Vorgang";
    case "unit_month":
    case "monthly_flat": return "Monate";
    default: return "pauschal";
  }
}

/**
 * Baut die Vorschlagszeilen für eine Liegenschaft.
 *
 * Grundvergütung wird als Jahreszeile vorgeschlagen (zwölf Monate),
 * weil das Honorar laufend per Selbstentnahme fließt und nur einmal
 * jährlich in Rechnung gestellt wird. Alles andere kommt als Zeile
 * mit Menge 1 und muss von Hand geprüft werden.
 */
export function suggestionsFromContract(
  contract: ContractWithDetails | null | undefined,
  year: number,
): BillingRow[] {
  if (!contract?.fees?.length) return [];
  const today = new Date().toISOString().slice(0, 10);
  const rows: BillingRow[] = [];

  const active = contract.fees.filter((f) => f.is_active);

  // --- Grundvergütung: eine Jahreszeile je Baustein ---
  for (const fee of active.filter((f) => BASE_BASES.includes(f.basis))) {
    const net = toNet(Number(fee.amount ?? 0), fee.is_gross, Number(fee.vat_rate));
    const count = fee.basis === "unit_month" ? Number(fee.quantity ?? 0) : 1;
    const monthly = Math.round(net * count * 100) / 100;
    if (monthly <= 0) continue;
    rows.push({
      key: `fee:${fee.id}:${year}`,
      origin: "contract",
      eventId: null,
      status: "suggested",
      label:
        fee.basis === "unit_month"
          ? `${fee.label} ${year} — ${count} × ${formatEur(net)} je Monat`
          : `${fee.label} ${year}`,
      quantity: 12,
      unit: "Monate",
      unitPriceNet: monthly,
      vatRate: Number(fee.vat_rate),
      debtor: fee.debtor,
      feeId: fee.id,
      contractId: contract.id,
      periodKey: String(year),
      sourceKind: "contract_fee",
      sourceId: null,
      occurredOn: today,
      hint: "Jahresrechnung für das laufend entnommene Honorar",
    });
  }

  // --- Zusatzleistungen ---
  for (const fee of active.filter((f) => !BASE_BASES.includes(f.basis))) {
    const percent = isPercentBasis(fee.basis);
    const net = toNet(Number(fee.amount ?? 0), fee.is_gross, Number(fee.vat_rate));

    // Staffelstufen desselben Typs zu einer Zeile zusammenfassen.
    const isTier = fee.tier_from !== null && fee.tier_from !== undefined;
    if (isTier && active.filter((f) => f.fee_type === fee.fee_type).indexOf(fee) !== 0) continue;

    const tierNote = isTier
      ? active
          .filter((f) => f.fee_type === fee.fee_type)
          .sort((a, b) => Number(a.tier_from ?? 0) - Number(b.tier_from ?? 0))
          .map((f) =>
            f.tier_to
              ? `bis ${formatEur(Number(f.tier_to))} ${Number(f.percent)} %`
              : `darüber ${Number(f.percent)} %`,
          )
          .join(" · ")
      : undefined;

    const hints = [fee.note, tierNote].filter(Boolean) as string[];
    if (fee.min_amount) hints.push(`mindestens ${formatEur(Number(fee.min_amount))}`);
    if (fee.max_count) hints.push(`höchstens ${fee.max_count} ×`);

    rows.push({
      key: `fee:${fee.id}`,
      origin: "contract",
      eventId: null,
      status: "suggested",
      label: isTier ? fee.label.replace(/,?\s*Stufe\s*\d+$/i, "") : fee.label,
      quantity: 1,
      unit: unitFor(fee.basis),
      unitPriceNet: percent ? null : net,
      vatRate: Number(fee.vat_rate),
      debtor: fee.debtor,
      feeId: fee.id,
      contractId: contract.id,
      periodKey: null,
      sourceKind: "contract_fee",
      sourceId: null,
      occurredOn: today,
      hint: hints.join(" · ") || undefined,
      needsInput: percent,
    });
  }

  return rows;
}

/** Datensatz aus der Datenbank in eine Zeile des Blatts übersetzen. */
export function rowFromEvent(ev: BillableEvent): BillingRow {
  const net =
    ev.amount_net !== null && ev.amount_net !== undefined
      ? Number(ev.amount_net)
      : ev.amount_gross !== null && ev.amount_gross !== undefined
        ? Math.round((Number(ev.amount_gross) / (1 + Number(ev.vat_rate) / 100)) * 100) / 100
        : 0;

  const origin: BillingRowOrigin =
    ev.source_kind === "time_entry" ? "time"
    : ev.source_kind === "preset" ? "preset"
    : ev.source_kind === "contract_fee" ? "contract"
    : "manual";

  return {
    key: `event:${ev.id}`,
    origin,
    eventId: ev.id,
    status: ev.status,
    label: ev.label,
    quantity: Number(ev.quantity ?? 1),
    unit: ev.unit ?? "pauschal",
    unitPriceNet: net,
    vatRate: Number(ev.vat_rate),
    debtor: ev.debtor,
    feeId: ev.fee_id,
    contractId: ev.contract_id,
    periodKey: ev.period_key,
    sourceKind: ev.source_kind,
    sourceId: ev.source_id,
    occurredOn: ev.occurred_on,
    hint: ev.notes ?? undefined,
    invoiceNumber: ev.invoice?.invoice_number ?? null,
    invoiceId: ev.rgi_invoice_id,
    dismissedReason: ev.dismissed_reason,
  };
}

/**
 * Blendet Vorschläge aus, für die es schon einen Datensatz gibt.
 * Maßgeblich ist der Vertragsbaustein zusammen mit dem Zeitraum —
 * genau die Kombination, die auch die Datenbank sperrt.
 */
export function mergeSuggestions(events: BillingRow[], suggestions: BillingRow[]): BillingRow[] {
  const taken = new Set(
    events
      .filter((e) => e.status !== "dismissed" && e.feeId)
      .map((e) => `${e.feeId}|${e.periodKey ?? ""}`),
  );
  // Ohne Zeitraum darf derselbe Baustein mehrfach anfallen
  // (drei Eigentümerwechsel im Jahr sind drei Posten). Deshalb
  // blockieren nur Vorschläge MIT Zeitraum.
  return suggestions.filter((s) => !(s.periodKey && taken.has(`${s.feeId}|${s.periodKey}`)));
}
