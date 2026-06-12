import { signedTotalForAccount, type BookingWithType } from "@/components/finance/lib/bookingAggregation";

export interface CoaAccount {
  id: string;
  account_number: string;
  account_name: string;
  is_billing_relevant: boolean;
  default_distribution_key: string | null;
}

export interface TenantAssignment {
  id: string;
  contact_id: string | null;
  name: string;
  unit_number: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

export interface ShareRow {
  assignment_id: string;
  share_type: string;
  share_value: number;
}

export interface CostRow {
  assignment_id: string;
  cost_type: string;
  amount: number;
  interval: string;
  valid_from: string | null;
  valid_to: string | null;
}

export interface AccountWarning {
  account_number: string;
  account_name: string;
  message: string;
}

export interface AccountRow {
  account: CoaAccount;
  total: number; // signed magnitude of expenses (>0 = Aufwand)
  distKey: string | null;
  totalShares: number;
  distributable: number; // sum of all tenant shares for this account
}

export interface TenantLineItem {
  account_number: string;
  account_name: string;
  distKey: string;
  myShare: number;
  totalShares: number;
  accountTotal: number;
  timeFactor: number; // 0..1
  amount: number;
}

export interface TenantSettlement {
  assignment_id: string;
  name: string;
  unit: string | null;
  from: string | null;
  to: string | null;
  months: number;
  lines: TenantLineItem[];
  totalUmlage: number;
  totalVorauszahlung: number;
  saldo: number; // >0 = Nachzahlung, <0 = Guthaben
}

export interface RentSettlementResult {
  accountRows: AccountRow[];
  tenants: TenantSettlement[];
  warnings: AccountWarning[];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

function overlapDays(
  aFrom: Date | null,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date
): number {
  const start = aFrom && aFrom > bFrom ? aFrom : bFrom;
  const end = aTo && aTo < bTo ? aTo : bTo;
  if (end < start) return 0;
  return daysBetween(start, end);
}

export interface ComputeArgs {
  accounts: CoaAccount[];
  bookings: BookingWithType[];
  tenants: TenantAssignment[];
  shares: ShareRow[];
  costs: CostRow[];
  fiscalYear: number;
}

export function computeRentSettlement({
  accounts,
  bookings,
  tenants,
  shares,
  costs,
  fiscalYear,
}: ComputeArgs): RentSettlementResult {
  const periodStart = new Date(`${fiscalYear}-01-01`);
  const periodEnd = new Date(`${fiscalYear}-12-31`);
  const periodDays = daysBetween(periodStart, periodEnd);

  const warnings: AccountWarning[] = [];

  // Active assignments with their period overlap & time factor
  const tenantInfo = tenants.map((t) => {
    const aFrom = t.valid_from ? new Date(t.valid_from) : null;
    const aTo = t.valid_to ? new Date(t.valid_to) : null;
    const days = overlapDays(aFrom, aTo, periodStart, periodEnd);
    return {
      assignment: t,
      days,
      timeFactor: days / periodDays,
      months: days / 30.4375,
    };
  });

  const billableAccounts = accounts.filter((a) => a.is_billing_relevant);

  const sharesByAssignment: Record<string, ShareRow[]> = {};
  for (const s of shares) {
    (sharesByAssignment[s.assignment_id] ||= []).push(s);
  }

  // Per-account overall row + per-tenant line items
  const tenantLines: Record<string, TenantLineItem[]> = {};
  for (const t of tenantInfo) tenantLines[t.assignment.id] = [];

  const accountRows: AccountRow[] = billableAccounts.map((acc) => {
    const total = Math.abs(signedTotalForAccount(acc.id, bookings));
    const distKey = (acc.default_distribution_key || "").trim() || null;

    if (!distKey) {
      warnings.push({
        account_number: acc.account_number,
        account_name: acc.account_name,
        message: "Kein Verteilerschlüssel im Kontenrahmen hinterlegt.",
      });
      return { account: acc, total, distKey, totalShares: 0, distributable: 0 };
    }

    // Collect shares for ACTIVE tenants only (days > 0)
    const tenantShares = tenantInfo
      .filter((t) => t.days > 0)
      .map((t) => {
        const sr = (sharesByAssignment[t.assignment.id] || []).find(
          (s) => (s.share_type || "").toLowerCase() === distKey.toLowerCase()
        );
        return { t, value: sr ? Number(sr.share_value || 0) : 0 };
      });

    const totalShares = tenantShares.reduce((s, x) => s + x.value, 0);

    if (totalShares <= 0) {
      warnings.push({
        account_number: acc.account_number,
        account_name: acc.account_name,
        message: `Schlüssel „${distKey}" ist für kein Mieter gepflegt oder Summe = 0.`,
      });
      return { account: acc, total, distKey, totalShares: 0, distributable: 0 };
    }

    // Distribute (time-weighted)
    let distributed = 0;
    for (const { t, value } of tenantShares) {
      if (value <= 0) continue;
      const quote = value / totalShares;
      const amount = total * quote * t.timeFactor;
      distributed += amount;
      tenantLines[t.assignment.id].push({
        account_number: acc.account_number,
        account_name: acc.account_name,
        distKey,
        myShare: value,
        totalShares,
        accountTotal: total,
        timeFactor: t.timeFactor,
        amount: Math.round(amount * 100) / 100,
      });
    }

    return {
      account: acc,
      total,
      distKey,
      totalShares,
      distributable: Math.round(distributed * 100) / 100,
    };
  });

  // NK-Vorauszahlungen pro Mieter (tag-genau)
  const tenants_: TenantSettlement[] = tenantInfo.map((t) => {
    const aFrom = t.assignment.valid_from ? new Date(t.assignment.valid_from) : null;
    const aTo = t.assignment.valid_to ? new Date(t.assignment.valid_to) : null;
    const tenantOverlapStart =
      aFrom && aFrom > periodStart ? aFrom : periodStart;
    const tenantOverlapEnd = aTo && aTo < periodEnd ? aTo : periodEnd;

    const myCosts = costs.filter(
      (c) =>
        c.assignment_id === t.assignment.id &&
        (c.cost_type || "").toLowerCase().includes("nebenkosten") &&
        (c.interval || "").toLowerCase() === "monatlich"
    );

    let vorauszahlung = 0;
    for (const c of myCosts) {
      const cFrom = c.valid_from ? new Date(c.valid_from) : tenantOverlapStart;
      const cTo = c.valid_to ? new Date(c.valid_to) : tenantOverlapEnd;
      const d = overlapDays(cFrom, cTo, tenantOverlapStart, tenantOverlapEnd);
      vorauszahlung += Number(c.amount || 0) * (d / 30.4375);
    }
    vorauszahlung = Math.round(vorauszahlung * 100) / 100;

    const lines = tenantLines[t.assignment.id] || [];
    const totalUmlage =
      Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

    return {
      assignment_id: t.assignment.id,
      name: t.assignment.name,
      unit: t.assignment.unit_number,
      from: t.assignment.valid_from,
      to: t.assignment.valid_to,
      months: Math.round(t.months * 10) / 10,
      lines,
      totalUmlage,
      totalVorauszahlung: vorauszahlung,
      saldo: Math.round((totalUmlage - vorauszahlung) * 100) / 100,
    };
  });

  return { accountRows, tenants: tenants_, warnings };
}
