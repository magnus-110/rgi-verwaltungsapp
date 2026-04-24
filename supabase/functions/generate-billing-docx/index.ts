// WEG Jahresabrechnung — DOCX Export
// Wiederverwendet die Datenladelogik aus generate-billing-pdf,
// rendert das Ergebnis aber als professionelles Word-Dokument im RGI-Design.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, BorderStyle,
  WidthType, ShadingType, VerticalAlign, PageBreak, HeightRule,
} from "npm:docx@8.5.0";
import {
  sumForAccount,
  signedTotalForAccount,
  getEffectiveOpeningBalance,
  getEffectiveClosingBalance,
} from "../_shared/booking-aggregation.ts";
import { RGI_LOGO_BASE64 } from "../_shared/rgi-logo.ts";

// ─────────── CONFIG ───────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Account patterns
const BANK_ACCOUNT_PATTERN = /^18\d{2}$/;
const RESERVE_ACCOUNT_PATTERN = /^17[0-9]\d$/;
const PERSONAL_ACCOUNT_PATTERN = /^0\d{3}$/;

// Design tokens (RGI-Branding)
const ORANGE       = "E8893A";
const ORANGE_LIGHT = "FEF3E8";
const SECTION_BG   = "FDEBD8";
const SECTION_TEXT = "A84D0C";
const TEAL         = "0D9488";
const GREEN_BG     = "ECFDF5";
const GREEN_TEXT   = "166534";
const RED_BG       = "FEF2F2";
const RED_TEXT     = "991B1B";
const GRAY_BG      = "F7F7F7";
const DARK         = "2B2B2B";
const MUTED        = "777777";
const WHITE        = "FFFFFF";
const BORDER_COLOR = "D8D8D8";

const FONT_HEADING = "Century Gothic";
const FONT_BODY    = "Work Sans";

const CW = 9906; // Inhaltsbreite A4 in DXA

// Distribution key labels
const DIST_KEY_LABELS: Record<string, string> = {
  mea: "MEA", einheiten: "Einheiten", einheit: "Einheiten", units: "Einheiten",
  qm: "Fläche (qm)", personen: "Personen",
  verbrauch_wasser: "Wasser", verbrauch_warmwasser: "Warmwasser",
  heizkostenverordnung: "Heizk.Abr.", heating_individual: "Heizk.Abr.", direkt: "direkt",
};
const DIST_KEY_TO_SHARE: Record<string, string> = {
  mea: "mea", einheiten: "einheit", units: "einheit", qm: "qm", personen: "personen",
  verbrauch_wasser: "wasser", verbrauch_warmwasser: "warmwasser",
  heizkostenverordnung: "heizkosten", heating_individual: "heizkosten",
};
const SECTION_LABELS: Record<string, string> = {
  income: "Einnahmen",
  operating_distributable: "Umlagefähige Bewirtschaftungskosten",
  operating_non_distributable: "Nicht umlagefähige Kosten",
  heating: "Heizkosten (nach Brunata)",
  accrual: "Abgrenzungen",
  reserve: "Erhaltungsrücklage",
  reserve_withdrawal: "Rücklagenentnahme",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("de-DE");
const fmtNum = (n: number) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(n);

// ─────────── HELPER PRIMITIVES ───────────
const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
const noBorder   = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders  = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function run(text: string, opts: any = {}) {
  return new TextRun({
    text: String(text ?? ""),
    font: opts.font || FONT_BODY,
    size: opts.size || 20,
    bold: opts.bold || false,
    italics: opts.italics || false,
    color: opts.color || DARK,
  });
}

function para(children: any, opts: any = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 0 },
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT_HEADING, size: 28, bold: true, color: DARK })],
    spacing: { before: 280, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ORANGE, space: 4 } },
  });
}

function subHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT_HEADING, size: 22, bold: true, color: ORANGE })],
    spacing: { before: 240, after: 100 },
  });
}

function headerCell(text: string, width: number, opts: any = {}) {
  return new TableCell({
    borders: allBorders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: ORANGE, type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONT_HEADING, size: 19, bold: true, color: WHITE })],
      alignment: opts.align || AlignmentType.LEFT,
    })],
  });
}

function dataCell(text: string, width: number, opts: any = {}) {
  return new TableCell({
    borders: allBorders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shading
      ? { fill: opts.shading, type: ShadingType.CLEAR, color: "auto" }
      : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    columnSpan: opts.colSpan,
    children: [new Paragraph({
      children: [new TextRun({
        text: String(text ?? ""),
        font: opts.font || FONT_BODY,
        size: opts.size || 19,
        bold: opts.bold || false,
        italics: opts.italics || false,
        color: opts.color || DARK,
      })],
      alignment: opts.align || AlignmentType.LEFT,
    })],
  });
}

function totalCell(text: string, width: number, opts: any = {}) {
  return dataCell(text, width, { ...opts, shading: opts.shading || ORANGE_LIGHT, bold: true });
}

function sectionHeaderRow(label: string, colSpan: number) {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: colSpan,
        borders: allBorders,
        shading: { fill: SECTION_BG, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [para([run(label, { font: FONT_HEADING, bold: true, size: 19, color: SECTION_TEXT })])],
      }),
    ],
  });
}

// Decode base64 to Uint8Array (Deno-compatible)
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
const LOGO_BYTES = base64ToBytes(RGI_LOGO_BASE64);

// ─────────── HEADER / FOOTER ───────────
function makeHeader(title: string, subtitle: string) {
  return new Header({
    children: [
      new Table({
        width: { size: CW, type: WidthType.DXA },
        columnWidths: [CW - 3500, 3500],
        borders: {
          top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
          insideHorizontal: noBorder, insideVertical: noBorder,
        },
        rows: [new TableRow({
          children: [
            new TableCell({
              borders: noBorders,
              width: { size: CW - 3500, type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                para([run(title, { font: FONT_HEADING, bold: true, size: 18 })]),
                para([run(subtitle, { size: 16, color: MUTED })]),
              ],
            }),
            new TableCell({
              borders: noBorders,
              width: { size: 3500, type: WidthType.DXA },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new ImageRun({
                  type: "png", data: LOGO_BYTES,
                  transformation: { width: 130, height: 49 },
                  altText: { title: "RGI", description: "RGI Immobilien", name: "RGI" },
                } as any)],
              })],
            }),
          ],
        })],
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 4 } },
        spacing: { before: 60, after: 0 },
        children: [],
      }),
    ],
  });
}

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 4 } },
        spacing: { before: 60, after: 0 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: "RGI Immobilien GmbH & Co. KG  ·  Vilstalstr. 4  ·  87459 Pfronten  ·  Tel. 08363 / 960656  ·  info@rgi-immobilien.de",
          font: FONT_BODY, size: 16, color: "888888",
        })],
      }),
    ],
  });
}

// ─────────── DATA LOADING ───────────
async function loadSettlementData(supabase: any, buildingId: string, periodId: string, fiscalYear: number) {
  const { data: period } = await supabase.from("billing_periods").select("*").eq("id", periodId).single();
  if (!period) throw new Error("Abrechnungszeitraum nicht gefunden");

  const [
    { data: building },
    { data: accounts },
    { data: bookings },
    { data: overrides },
    { data: assignments },
    { data: balances },
    { data: heatingValues },
    { data: planItems },
  ] = await Promise.all([
    supabase.from("buildings").select("name, address, manager_name, unit_count, unit_count_for_billing").eq("id", buildingId).single(),
    supabase.from("chart_of_accounts").select("*").or(`building_id.is.null,building_id.eq.${buildingId}`).order("account_number"),
    supabase.from("bookings")
      .select("id, account_id, counter_account_id, amount, booking_date, description, booking_category, is_35a_relevant, status, fiscal_year")
      .eq("building_id", buildingId)
      .gte("booking_date", period.period_from)
      .lte("booking_date", period.period_to)
      .neq("status", "cancelled"),
    supabase.from("building_account_overrides").select("*").eq("building_id", buildingId),
    supabase.from("contact_building_assignments")
      .select(`*, contacts(first_name, last_name, company_name, salutation, address_street, address_zip, address_city), contact_building_shares(*), contact_building_costs(*)`)
      .eq("building_id", buildingId)
      .eq("is_active", true)
      .in("role_in_building", ["eigentuemer", "mieter"]),
    supabase.from("account_balances").select("*, chart_of_accounts(account_number, account_name, category, carry_forward_balance)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear),
    supabase.from("heating_distribution_values").select("*").eq("building_id", buildingId).eq("billing_period_id", periodId),
    supabase.from("economic_plans" as any).select("*, economic_plan_items(*)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear).maybeSingle(),
  ]);

  const allBookings = bookings || [];
  const allAccounts = accounts || [];
  const totalReserveFromPlan = (planItems as any)?.total_reserve != null ? Number((planItems as any).total_reserve) : 0;
  const bookingsExclHeatingRepost = allBookings.filter((b: any) => b.booking_category !== "heating_repost");
  const openingAccount = allAccounts.find((a: any) => a.account_number === "4000");
  const openingAccountId = openingAccount?.id ?? null;

  const getDistKey = (accountId: string, defaultKey: string | null) => {
    const override = (overrides || []).find((o: any) => o.account_id === accountId);
    return override?.distribution_key || defaultKey || "mea";
  };

  const getTimeProportion = (assignment: any) => {
    const periodStart = new Date(period.period_from).getTime();
    const periodEnd = new Date(period.period_to).getTime();
    const totalDays = (periodEnd - periodStart) / 86400000 + 1;
    const validFrom = assignment.valid_from ? new Date(assignment.valid_from).getTime() : periodStart;
    const validTo = assignment.valid_to ? new Date(assignment.valid_to).getTime() : periodEnd;
    const effectiveStart = Math.max(periodStart, validFrom);
    const effectiveEnd = Math.min(periodEnd, validTo);
    return Math.max(0, (effectiveEnd - effectiveStart) / 86400000 + 1) / totalDays;
  };

  const billingAccounts = allAccounts.filter((a: any) => a.is_billing_relevant || a.settlement_section);
  const brunataTotal = (heatingValues || []).reduce((s: number, hv: any) => s + Number(hv.amount), 0);
  const accountTotals = billingAccounts.map((acc: any) => {
    const distKey = getDistKey(acc.id, acc.default_distribution_key);
    const sourceBookings = acc.is_heating_relevant ? bookingsExclHeatingRepost : allBookings;
    const total = acc.account_number === "1400" && brunataTotal > 0
      ? brunataTotal
      : signedTotalForAccount(acc.id, sourceBookings as any);
    const absTotal = Math.abs(total);
    const wpItem = (planItems as any)?.economic_plan_items?.find((i: any) => i.account_id === acc.id);
    const wpAmount = wpItem ? Number(wpItem.planned_amount || 0) : 0;
    return { ...acc, total, absTotal, distKey, wpAmount };
  });

  const sectionOrder = ["income", "operating_distributable", "operating_non_distributable", "heating", "accrual", "reserve", "reserve_withdrawal"];
  const sections = sectionOrder.map((sec) => {
    const accountsInSec = accountTotals.filter((a: any) => a.settlement_section === sec && a.absTotal > 0);
    let total = accountsInSec.reduce((s: number, a: any) => s + a.absTotal, 0);
    if (sec === "reserve" && totalReserveFromPlan > 0) total = totalReserveFromPlan;
    return {
      id: sec, label: SECTION_LABELS[sec] || sec,
      accounts: accountsInSec, total,
      wpTotal: accountTotals.filter((a: any) => a.settlement_section === sec).reduce((s: number, a: any) => s + a.wpAmount, 0),
    };
  }).filter((s) => s.accounts.length > 0 || (s.id === "reserve" && s.total > 0));

  const isReserveWithdrawalAccount = (a: any) => a.reserve_role === "withdrawal" || a.is_reserve_funded === true;
  const reserveFundedAccounts = allAccounts.filter(isReserveWithdrawalAccount);
  const totalReserveWithdrawal = reserveFundedAccounts.reduce((s: number, a: any) => s + Math.abs(sumForAccount(a.id, allBookings as any)), 0);

  const isAccrualBalanceAccount = (a: any) => a.account_number === "4110" || a.account_number === "4130" || a.settlement_section === "accrual";
  const isHeatingPrepayAccount = (a: any) => a.settlement_section === "heating_prepayment";
  const isPersonalAccount = (a: any) => PERSONAL_ACCOUNT_PATTERN.test(a.account_number || "");
  const distributableAccounts = accountTotals.filter((a: any) =>
    a.is_distributable && !isPersonalAccount(a) && a.settlement_section !== "income"
    && !isAccrualBalanceAccount(a) && !isHeatingPrepayAccount(a) && a.absTotal > 0,
  );

  const getShareTotal = (shareType: string) => {
    const mapped = DIST_KEY_TO_SHARE[shareType] || shareType;
    if (mapped === "einheit") {
      return building?.unit_count_for_billing ?? building?.unit_count ?? (assignments || []).length;
    }
    return (assignments || []).reduce((s: number, a: any) => {
      const share = (a.contact_building_shares || []).find((sh: any) => sh.share_type === mapped);
      return s + (share ? Number(share.share_value) : 0);
    }, 0);
  };

  const isBankAccount = (a: any) => a.settlement_section === "bank" || BANK_ACCOUNT_PATTERN.test(a.account_number || "");
  const isReserveBalanceAccount = (a: any) =>
    (a.settlement_section === "reserve" || RESERVE_ACCOUNT_PATTERN.test(a.account_number || ""))
    && a.carry_forward_balance === true && !isPersonalAccount(a);

  const bankAccountsForBalance = allAccounts.filter(isBankAccount);
  const reserveAccountsForBalance = allAccounts.filter(isReserveBalanceAccount);
  const balancesArr = (balances || []) as any[];

  const sumOpening = (accs: any[]) =>
    accs.reduce((s, a) => s + getEffectiveOpeningBalance(a.id, allBookings as any, balancesArr, fiscalYear, openingAccountId).amount, 0);
  const sumClosing = (accs: any[]) =>
    accs.reduce((s, a) => {
      const manual = balancesArr.find((b) => b.account_id === a.id);
      if (manual && manual.closing_balance != null && Number(manual.closing_balance) !== 0) {
        return s + Number(manual.closing_balance);
      }
      return s + getEffectiveClosingBalance(a.id, allBookings as any, balancesArr, fiscalYear, openingAccountId).amount;
    }, 0);

  const openingGiro = sumOpening(bankAccountsForBalance);
  const openingRL = sumOpening(reserveAccountsForBalance);
  const closingGiro = sumClosing(bankAccountsForBalance);
  const closingRL = sumClosing(reserveAccountsForBalance);

  // Soll-Vorschüsse aus Stammdaten
  const periodStartMs0 = new Date(period.period_from).getTime();
  const periodEndMs0 = new Date(period.period_to).getTime();
  const calcCostAnnual = (cost: any, timeProp: number) => {
    const amount = Number(cost.amount) || 0;
    let perDay = 0;
    switch (cost.interval) {
      case "monatlich": perDay = (amount * 12) / 365; break;
      case "quartal": perDay = (amount * 4) / 365; break;
      case "jaehrlich": perDay = amount / 365; break;
      default: perDay = (amount * 12) / 365; break;
    }
    const eStart = cost.valid_from ? new Date(cost.valid_from).getTime() : periodStartMs0;
    const eEnd = cost.valid_to ? new Date(cost.valid_to).getTime() : periodEndMs0;
    const effStart = Math.max(periodStartMs0, eStart);
    const effEnd = Math.min(periodEndMs0, eEnd);
    const days = Math.max(0, (effEnd - effStart) / 86400000 + 1);
    return perDay * days * timeProp;
  };
  let totalSollKostendeckung = 0, totalSollEHR = 0;
  (assignments || []).forEach((a: any) => {
    const tp = getTimeProportion(a);
    (a.contact_building_costs || []).forEach((c: any) => {
      const ct = (c.cost_type || "").toLowerCase();
      const annual = calcCostAnnual(c, tp);
      if (["hausgeld", "nebenkosten"].includes(ct)) {
        const reserveShareMonthly = Number(c.reserve_share_monthly) || 0;
        if (reserveShareMonthly > 0 && c.interval === "monatlich") {
          const fullMonthly = Number(c.amount) || 0;
          const ratio = fullMonthly > 0 ? Math.min(reserveShareMonthly / fullMonthly, 1) : 0;
          totalSollEHR += annual * ratio;
          totalSollKostendeckung += annual * (1 - ratio);
        } else { totalSollKostendeckung += annual; }
      } else if (ct === "ruecklage") { totalSollEHR += annual; }
      else { totalSollKostendeckung += annual; }
    });
  });
  const totalSollVorschuss = totalSollKostendeckung + totalSollEHR;

  const incomeAccs = sections.find((s) => s.id === "income")?.accounts || [];
  const interestIncome = incomeAccs.filter((a: any) => String(a.account_number || "").startsWith("184")).reduce((s: number, a: any) => s + a.absTotal, 0);
  const otherIncome = incomeAccs.filter((a: any) => !String(a.account_number || "").startsWith("184")).reduce((s: number, a: any) => s + a.absTotal, 0);

  const personalAccounts = allAccounts.filter((a: any) => PERSONAL_ACCOUNT_PATTERN.test(a.account_number) && a.account_number !== "0000");
  const padUnit = (n: any) => { const s = String(n ?? "").replace(/\D/g, ""); return s ? s.padStart(4, "0") : ""; };

  // Per-owner calculation
  const ownerResults = (assignments || []).map((assignment: any) => {
    const contact = assignment.contacts;
    const name = contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unbekannt";
    const salutation = contact?.salutation || "";
    const shares = assignment.contact_building_shares || [];
    const costs = assignment.contact_building_costs || [];
    const timeProportion = getTimeProportion(assignment);

    const accountBreakdown: any[] = [];
    let totalOwnerCost = 0, total35aDienste = 0, total35aHandwerker = 0, ownerReserveWithdrawal = 0;
    let umlSum = 0, numlSum = 0;

    distributableAccounts.forEach((acc: any) => {
      const isHeating = acc.is_heating_relevant && acc.account_number === "1400";
      const heatingVal = isHeating ? (heatingValues || []).find((hv: any) => hv.assignment_id === assignment.id) : null;
      const isReserveAcc = acc.settlement_section === "reserve";
      const total = isReserveAcc && totalReserveFromPlan > 0 ? totalReserveFromPlan : acc.absTotal;

      let ownerCost: number, distLabel: string, totalShares: number, ownerShareValue: number;

      if (heatingVal) {
        ownerCost = Number(heatingVal.amount);
        distLabel = "Heizk.Abr.";
        totalShares = total;
        ownerShareValue = ownerCost;
      } else {
        const distKey = acc.distKey;
        const shareType = DIST_KEY_TO_SHARE[distKey] || distKey;
        totalShares = getShareTotal(distKey);
        if (shareType === "einheit") {
          ownerShareValue = 1;
          ownerCost = totalShares > 0 ? (total / totalShares) * timeProportion : 0;
        } else {
          const ownerShare = shares.find((s: any) => s.share_type === shareType);
          ownerShareValue = ownerShare ? Number(ownerShare.share_value) : 0;
          ownerCost = totalShares > 0 && ownerShareValue > 0
            ? total * (ownerShareValue / totalShares) * timeProportion : 0;
        }
        distLabel = DIST_KEY_LABELS[distKey] || distKey;
      }

      if (ownerCost > 0) {
        const displaySection = acc.settlement_section || "operating_distributable";
        accountBreakdown.push({
          accountNumber: acc.account_number, accountName: acc.account_name,
          distributableAmount: total, distLabel, totalShares,
          ownerShare: ownerShareValue, ownerCost, displaySection,
        });
        totalOwnerCost += ownerCost;
        if (displaySection === "operating_distributable" || displaySection === "heating") umlSum += ownerCost;
        if (displaySection === "operating_non_distributable") numlSum += ownerCost;
        if (acc.settlement_35a_type === "dienste") total35aDienste += ownerCost;
        else if (acc.settlement_35a_type === "handwerker") total35aHandwerker += ownerCost;
        if (isReserveWithdrawalAccount(acc)) ownerReserveWithdrawal += ownerCost;
      }
    });

    const ownerAccount = personalAccounts.find((a: any) => a.account_number === padUnit(assignment.unit_number));
    const currentYearBookings = allBookings.filter((b: any) => !b.fiscal_year || b.fiscal_year === fiscalYear);

    const calcAnnual = (types: string[]) =>
      costs.filter((c: any) => types.map((t) => t.toLowerCase()).includes((c.cost_type || "").toLowerCase()))
        .reduce((s: number, c: any) => {
          const amount = Number(c.amount);
          let perDay = 0;
          switch (c.interval) {
            case "monatlich": perDay = (amount * 12) / 365; break;
            case "quartal": perDay = (amount * 4) / 365; break;
            case "jaehrlich": perDay = amount / 365; break;
            default: perDay = (amount * 12) / 365; break;
          }
          const periodStartMs = new Date(period.period_from).getTime();
          const periodEndMs = new Date(period.period_to).getTime();
          const entryStartMs = c.valid_from ? new Date(c.valid_from).getTime() : periodStartMs;
          const entryEndMs = c.valid_to ? new Date(c.valid_to).getTime() : periodEndMs;
          const effectiveStart = Math.max(periodStartMs, entryStartMs);
          const effectiveEnd = Math.min(periodEndMs, entryEndMs);
          const effectiveDays = Math.max(0, (effectiveEnd - effectiveStart) / 86400000 + 1);
          return s + perDay * effectiveDays;
        }, 0) * timeProportion;

    const annualHausgeld = ownerAccount
      ? Math.abs(sumForAccount(ownerAccount.id, currentYearBookings as any))
      : calcAnnual(["hausgeld", "nebenkosten"]);
    const annualReserve = ownerAccount ? 0 : calcAnnual(["ruecklage"]);
    const totalPaid = annualHausgeld + annualReserve;
    const totalVorschuss = calcAnnual(["hausgeld", "nebenkosten", "ruecklage"]);
    const netOwnerCost = totalOwnerCost - ownerReserveWithdrawal;
    const result = totalPaid - netOwnerCost;
    const abrechnungsspitze = totalVorschuss - totalPaid;

    return {
      assignmentId: assignment.id, name, salutation,
      addressStreet: contact?.address_street || "",
      addressCity: [contact?.address_zip, contact?.address_city].filter(Boolean).join(" "),
      unitNumber: assignment.unit_number || "–",
      mea: shares.find((s: any) => s.share_type === "mea")?.share_value || 0,
      accountBreakdown, totalOwnerCost, ownerReserveWithdrawal, netOwnerCost,
      annualHausgeld, annualReserve, totalPaid, totalVorschuss, abrechnungsspitze, result,
      total35aDienste, total35aHandwerker, timeProportion, umlSum, numlSum,
    };
  });

  // Top-Konto für Gesamttext
  const allOperatingAccounts = sections
    .filter((s) => s.id !== "income" && s.id !== "reserve_withdrawal")
    .flatMap((s) => s.accounts);
  const topAcc = [...allOperatingAccounts].sort((a, b) => b.absTotal - a.absTotal)[0];
  const totalVorschussAll = ownerResults.reduce((s, o) => s + o.totalPaid, 0);
  const abrechnungsspitzeAll = totalSollVorschuss - totalVorschussAll;

  return {
    period, building, fiscalYear, sections, ownerResults,
    openingGiro, openingRL, closingGiro, closingRL,
    bankAccountsForBalance, reserveAccountsForBalance, balancesArr, allBookings, openingAccountId,
    totalReserveWithdrawal, reserveFundedAccounts,
    totalSollKostendeckung, totalSollEHR, totalSollVorschuss,
    interestIncome, otherIncome,
    totalReserveFromPlan,
    topKonto: topAcc?.account_name || "—",
    topBetrag: topAcc?.absTotal || 0,
    totalVorschuss: totalVorschussAll,
    abrechnungsspitze: abrechnungsspitzeAll,
  };
}

// ─────────── KI-TEXTE (Lovable AI Gateway) ───────────
const KI_FALLBACK = {
  gesamt: "Die Abrechnung wurde auf Basis der tatsächlichen Einnahmen und Ausgaben des Wirtschaftsjahres erstellt. Sie zeigt, wie die geleisteten Vorschüsse verwendet wurden und welche Kosten auf die Eigentümergemeinschaft entfallen sind.",
  ergebnis: "Die Berechnung Ihres Anteils erfolgte auf Basis der tatsächlichen Kosten des Wirtschaftsjahres und Ihrer hinterlegten Verteilerschlüssel.",
  uml: "Umlagefähige Kosten nach §2 BetrKV (z. B. Wasser, Müll, Hausmeister, Versicherung, Heizung) dürfen Sie als Vermieter vollständig auf Ihren Mieter über die Nebenkostenabrechnung umlegen.",
  numl: "Nicht umlagefähige Kosten wie Verwaltergebühr und Zuführung zur Erhaltungsrücklage trägt der Eigentümer selbst — sie dürfen NICHT auf den Mieter umgelegt werden.",
};

async function generateKiTexts(data: any, ownerId?: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;

  async function ask(prompt: string): Promise<string> {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) return "";
      const json = await res.json();
      return (json.choices?.[0]?.message?.content || "").trim();
    } catch { return ""; }
  }

  const gesamtText = await ask(
    `Du bist ein freundlicher WEG-Verwalter. Schreibe eine kurze Zusammenfassung (3–4 Sätze) der WEG-Gesamtabrechnung. Einfaches Deutsch, kein Fachjargon, kein Bullet-Point-Format, nur Fließtext.
WEG: ${data.building?.name || "—"}
Wirtschaftsjahr: ${data.fiscalYear}
Vorschüsse (Hausgeld gesamt): ${fmt(data.totalVorschuss)}
Größter Kostenblock: ${data.topKonto} mit ${fmt(data.topBetrag)}
Aus Rücklage entnommen: ${fmt(data.totalReserveWithdrawal)}`,
  );

  const owners = ownerId
    ? [data.ownerResults.find((o: any) => o.assignmentId === ownerId)].filter(Boolean)
    : data.ownerResults;

  const ownerTexts = await Promise.all(owners.map(async (o: any) => {
    const umlKonten = o.accountBreakdown
      .filter((r: any) => r.displaySection === "operating_distributable" || r.displaySection === "heating")
      .map((r: any) => r.accountName).join(", ") || "—";
    const numlKonten = o.accountBreakdown
      .filter((r: any) => r.displaySection === "operating_non_distributable")
      .map((r: any) => r.accountName).join(", ") || "—";
    const topRow = [...o.accountBreakdown].sort((a: any, b: any) => b.ownerCost - a.ownerCost)[0];

    const [ergebnisText, umlText, numlText] = await Promise.all([
      ask(`Du bist ein freundlicher WEG-Verwalter. Erkläre dem Eigentümer sein Abrechnungsergebnis in 2–3 Sätzen. Einfaches Deutsch, kein Bullet-Point-Format, nur Fließtext.
Eigentümer: ${o.name} (Einheit ${o.unitNumber})
Hausgeld ${data.fiscalYear}: ${fmt(o.totalPaid)}
Berechneter Kostenanteil: ${fmt(o.totalOwnerCost)}
Ergebnis: ${fmt(Math.abs(o.result))} ${o.result >= 0 ? "Guthaben" : "Nachzahlung"}
Größte Kostenposition: ${topRow?.accountName || "—"} mit ${fmt(topRow?.ownerCost ?? 0)}`),
      ask(`Erkläre in 1–2 Sätzen, was umlagefähige Betriebskosten nach §2 BetrKV sind und dass Vermieter diese auf ihren Mieter umlegen dürfen. Nenne kurz die konkreten Posten. Nur Fließtext, kein Bullet-Format.
Positionen: ${umlKonten}
Gesamtbetrag: ${fmt(o.umlSum)}`),
      ask(`Erkläre in 1–2 Sätzen, was nicht umlagefähige Kosten sind und dass Vermieter diese selbst tragen müssen. Nenne kurz die Posten. Nur Fließtext, kein Bullet-Format.
Positionen: ${numlKonten}
Gesamtbetrag: ${fmt(o.numlSum)}`),
    ]);

    return {
      assignmentId: o.assignmentId,
      ergebnisText: ergebnisText || KI_FALLBACK.ergebnis,
      umlText: umlText || KI_FALLBACK.uml,
      numlText: numlText || KI_FALLBACK.numl,
    };
  }));

  return { gesamtText: gesamtText || KI_FALLBACK.gesamt, ownerTexts };
}

// ─────────── DOCUMENT BUILDERS ───────────
function buildCoverPage(data: any): Paragraph[] {
  const docTitle = `WEG Jahresabrechnung ${data.fiscalYear}`;
  const periodLabel = `${fmtDate(data.period.period_from)} – ${fmtDate(data.period.period_to)}`;

  const elements: Paragraph[] = [];

  // Vertikaler Abstand oben
  elements.push(para([run("")], { before: 1400 }));

  // Logo zentriert (groß)
  elements.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 600 },
    children: [new ImageRun({
      type: "png", data: LOGO_BYTES,
      transformation: { width: 220, height: 83 },
      altText: { title: "RGI Immobilien", description: "RGI Immobilien Logo", name: "RGI" },
    } as any)],
  }));

  // Titel mit orangen Linien
  elements.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600, after: 200 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 12, color: ORANGE, space: 16 },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: ORANGE, space: 16 },
    },
    children: [new TextRun({ text: docTitle, font: FONT_HEADING, size: 56, bold: true, color: DARK })],
  }));

  // Untertitel: Adresse
  elements.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 800 },
    children: [
      new TextRun({ text: data.building?.name || "", font: FONT_HEADING, size: 32, bold: true, color: ORANGE }),
      new TextRun({ text: "\n", break: 1 }),
      new TextRun({ text: data.building?.address || "", font: FONT_BODY, size: 22, color: MUTED }),
    ],
  }));

  return elements;
}

function buildCoverInfoTable(data: any): Table {
  const periodLabel = `${fmtDate(data.period.period_from)} – ${fmtDate(data.period.period_to)}`;
  const today = new Date().toLocaleDateString("de-DE");
  const rows: Array<[string, string]> = [
    ["Objekt", data.building?.name || "—"],
    ["Adresse", data.building?.address || "—"],
    ["Wirtschaftsjahr", String(data.fiscalYear)],
    ["Abrechnungszeitraum", periodLabel],
    ["Verwalter", data.building?.manager_name || "RGI Immobilien"],
    ["Erstellt am", today],
  ];

  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [3000, CW - 3000],
    rows: rows.map(([k, v]) => new TableRow({
      children: [
        dataCell(k, 3000, { bold: true, shading: GRAY_BG }),
        dataCell(v, CW - 3000),
      ],
    })),
  });
}

function buildOwnersTable(data: any): Table {
  const w = [800, 3200, 1400, 1500, 1500, CW - 8400];
  const rows: TableRow[] = [];

  // Header
  rows.push(new TableRow({
    tableHeader: true,
    children: [
      headerCell("Nr.", w[0]),
      headerCell("Eigentümer", w[1]),
      headerCell("MEA", w[2], { align: AlignmentType.RIGHT }),
      headerCell("Hausgeld", w[3], { align: AlignmentType.RIGHT }),
      headerCell("Kostenanteil", w[4], { align: AlignmentType.RIGHT }),
      headerCell("Ergebnis", w[5], { align: AlignmentType.RIGHT }),
    ],
  }));

  data.ownerResults.forEach((o: any, idx: number) => {
    const bg = idx % 2 === 0 ? GRAY_BG : WHITE;
    const resColor = o.result >= 0 ? GREEN_TEXT : RED_TEXT;
    rows.push(new TableRow({
      children: [
        dataCell(String(o.unitNumber), w[0], { shading: bg }),
        dataCell(o.name, w[1], { shading: bg }),
        dataCell(fmtNum(Number(o.mea) || 0), w[2], { shading: bg, align: AlignmentType.RIGHT }),
        dataCell(fmt(o.totalPaid), w[3], { shading: bg, align: AlignmentType.RIGHT }),
        dataCell(fmt(o.totalOwnerCost), w[4], { shading: bg, align: AlignmentType.RIGHT }),
        dataCell((o.result >= 0 ? "+" : "−") + " " + fmt(Math.abs(o.result)), w[5], {
          shading: bg, align: AlignmentType.RIGHT, bold: true, color: resColor,
        }),
      ],
    }));
  });

  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: w, rows });
}

function buildGesamtabrechnung(data: any, kiTexts: any): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(sectionHeading("Gesamtabrechnung"));
  elements.push(para([run(`Wirtschaftsjahr ${data.fiscalYear}  ·  ${fmtDate(data.period.period_from)} – ${fmtDate(data.period.period_to)}`,
    { color: MUTED, size: 18 })], { after: 200 }));

  // EINNAHMEN
  elements.push(subHeading("Einnahmen (Soll)"));
  const incomeWidths = [CW - 2500, 2500];
  const incomeRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell("Position", incomeWidths[0]),
        headerCell("Betrag", incomeWidths[1], { align: AlignmentType.RIGHT }),
      ],
    }),
    new TableRow({ children: [
      dataCell("Vorschüsse Kostendeckung (Hausgeld)", incomeWidths[0], { shading: GREEN_BG }),
      dataCell(fmt(data.totalSollKostendeckung), incomeWidths[1], { shading: GREEN_BG, align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      dataCell("Zuführung Erhaltungsrücklage (Soll)", incomeWidths[0], { shading: GREEN_BG }),
      dataCell(fmt(data.totalSollEHR), incomeWidths[1], { shading: GREEN_BG, align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      dataCell("Zinseinnahmen", incomeWidths[0], { shading: GREEN_BG }),
      dataCell(fmt(data.interestIncome), incomeWidths[1], { shading: GREEN_BG, align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      dataCell("Sonstige Einnahmen", incomeWidths[0], { shading: GREEN_BG }),
      dataCell(fmt(data.otherIncome), incomeWidths[1], { shading: GREEN_BG, align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      totalCell("Summe Einnahmen", incomeWidths[0]),
      totalCell(fmt(data.totalSollVorschuss + data.interestIncome + data.otherIncome), incomeWidths[1], { align: AlignmentType.RIGHT }),
    ]}),
  ];
  elements.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: incomeWidths, rows: incomeRows }));

  // AUSGABEN
  elements.push(subHeading("Ausgaben (Ist)"));
  const expWidths = [900, CW - 900 - 1800 - 1800 - 1800, 1800, 1800, 1800];
  const expRows: TableRow[] = [
    new TableRow({ tableHeader: true, children: [
      headerCell("Konto", expWidths[0]),
      headerCell("Bezeichnung", expWidths[1]),
      headerCell("Plan (WP)", expWidths[2], { align: AlignmentType.RIGHT }),
      headerCell("Ist", expWidths[3], { align: AlignmentType.RIGHT }),
      headerCell("Verteilbar", expWidths[4], { align: AlignmentType.RIGHT }),
    ]}),
  ];

  const expenseSectionOrder = ["operating_distributable", "operating_non_distributable", "heating", "reserve", "accrual"];
  let totalIst = 0, totalPlan = 0, totalDistributable = 0;

  expenseSectionOrder.forEach((secId) => {
    const sec = data.sections.find((s: any) => s.id === secId);
    if (!sec) return;
    expRows.push(sectionHeaderRow(sec.label, 5));
    sec.accounts.forEach((acc: any) => {
      totalIst += acc.absTotal;
      totalPlan += acc.wpAmount;
      if (acc.is_distributable) totalDistributable += acc.absTotal;
      expRows.push(new TableRow({ children: [
        dataCell(acc.account_number, expWidths[0]),
        dataCell(acc.account_name, expWidths[1]),
        dataCell(acc.wpAmount > 0 ? fmt(acc.wpAmount) : "–", expWidths[2], { align: AlignmentType.RIGHT }),
        dataCell(fmt(acc.absTotal), expWidths[3], { align: AlignmentType.RIGHT }),
        dataCell(acc.is_distributable ? fmt(acc.absTotal) : "–", expWidths[4], { align: AlignmentType.RIGHT }),
      ]}));
    });
    if (secId === "reserve" && data.totalReserveWithdrawal > 0) {
      data.reserveFundedAccounts.forEach((acc: any) => {
        const t = Math.abs(sumForAccount(acc.id, data.allBookings as any));
        if (t === 0) return;
        expRows.push(new TableRow({ children: [
          dataCell(acc.account_number, expWidths[0], { italics: true, color: GREEN_TEXT }),
          dataCell("./. Entnahme: " + acc.account_name, expWidths[1], { italics: true, color: GREEN_TEXT }),
          dataCell("–", expWidths[2], { align: AlignmentType.RIGHT, italics: true, color: GREEN_TEXT }),
          dataCell("− " + fmt(t), expWidths[3], { align: AlignmentType.RIGHT, italics: true, color: GREEN_TEXT }),
          dataCell("–", expWidths[4], { align: AlignmentType.RIGHT, italics: true, color: GREEN_TEXT }),
        ]}));
      });
    }
  });
  expRows.push(new TableRow({ children: [
    totalCell("", expWidths[0]),
    totalCell("Summe Ausgaben", expWidths[1]),
    totalCell(fmt(totalPlan), expWidths[2], { align: AlignmentType.RIGHT }),
    totalCell(fmt(totalIst), expWidths[3], { align: AlignmentType.RIGHT }),
    totalCell(fmt(totalDistributable), expWidths[4], { align: AlignmentType.RIGHT }),
  ]}));
  elements.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: expWidths, rows: expRows }));

  // ABRECHNUNGSSALDO
  elements.push(subHeading("Abrechnungssaldo"));
  const saldoWidths = [CW - 2800, 2800];
  const saldo = data.totalSollVorschuss - totalIst;
  const saldoRows: TableRow[] = [
    new TableRow({ children: [
      dataCell("Summe Einnahmen (Vorschüsse Soll)", saldoWidths[0]),
      dataCell(fmt(data.totalSollVorschuss), saldoWidths[1], { align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      dataCell("Summe Ausgaben (Ist)", saldoWidths[0]),
      dataCell(fmt(totalIst), saldoWidths[1], { align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      totalCell("Abrechnungsspitze (" + (saldo >= 0 ? "WEG-Guthaben" : "WEG-Nachzahlung") + ")", saldoWidths[0],
        { shading: saldo >= 0 ? GREEN_BG : RED_BG, color: saldo >= 0 ? GREEN_TEXT : RED_TEXT }),
      totalCell(fmt(Math.abs(saldo)), saldoWidths[1], {
        shading: saldo >= 0 ? GREEN_BG : RED_BG, color: saldo >= 0 ? GREEN_TEXT : RED_TEXT, align: AlignmentType.RIGHT,
      }),
    ]}),
  ];
  elements.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: saldoWidths, rows: saldoRows }));

  // BANKBESTÄNDE
  elements.push(subHeading("Bestandsentwicklung"));
  const bestWidths = [CW - 2400 - 2400, 2400, 2400];
  const bestRows: TableRow[] = [
    new TableRow({ tableHeader: true, children: [
      headerCell("Konto", bestWidths[0]),
      headerCell("Anfangsbestand", bestWidths[1], { align: AlignmentType.RIGHT }),
      headerCell("Endbestand", bestWidths[2], { align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      dataCell("Bankkonten (Giro)", bestWidths[0]),
      dataCell(fmt(data.openingGiro), bestWidths[1], { align: AlignmentType.RIGHT }),
      dataCell(fmt(data.closingGiro), bestWidths[2], { align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      dataCell("Erhaltungsrücklage", bestWidths[0]),
      dataCell(fmt(data.openingRL), bestWidths[1], { align: AlignmentType.RIGHT }),
      dataCell(fmt(data.closingRL), bestWidths[2], { align: AlignmentType.RIGHT }),
    ]}),
    new TableRow({ children: [
      totalCell("Gesamtvermögen", bestWidths[0]),
      totalCell(fmt(data.openingGiro + data.openingRL), bestWidths[1], { align: AlignmentType.RIGHT }),
      totalCell(fmt(data.closingGiro + data.closingRL), bestWidths[2], { align: AlignmentType.RIGHT }),
    ]}),
  ];
  elements.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: bestWidths, rows: bestRows }));

  // EIGENTÜMERLISTE
  elements.push(subHeading("Eigentümerübersicht"));
  elements.push(buildOwnersTable(data));

  // KI-Erklärung
  const gesamtText = kiTexts?.gesamtText || KI_FALLBACK.gesamt;
  elements.push(new Paragraph({
    spacing: { before: 320, after: 80 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 4 } },
    children: [new TextRun({ text: "KI-Erklärung · Diese Abrechnung auf einen Blick",
      font: FONT_BODY, size: 16, color: "999999", bold: true })],
  }));
  elements.push(para([run(gesamtText, { size: 18 })], { before: 60, after: 200 }));

  return elements;
}

function buildKiBlock(ergebnisText: string, umlText: string, umlSum: number, numlText: string, numlSum: number): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  elements.push(new Paragraph({
    spacing: { before: 280, after: 80 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 4 } },
    children: [new TextRun({ text: "KI-Erklärung · Ihre Abrechnung auf einen Blick",
      font: FONT_BODY, size: 16, color: "999999", bold: true })],
  }));
  elements.push(para([run(ergebnisText, { size: 18 })], { before: 60, after: 140 }));

  // Umlagefähig-Box
  elements.push(new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({
      children: [new TableCell({
        borders: allBorders,
        width: { size: CW, type: WidthType.DXA },
        shading: { fill: ORANGE_LIGHT, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 100, bottom: 100, left: 160, right: 160 },
        children: [
          para([run(`Umlagefähige Kosten (${fmt(umlSum)})`,
            { font: FONT_HEADING, size: 19, bold: true, color: SECTION_TEXT })], { after: 60 }),
          para([run(umlText, { size: 17 })]),
        ],
      })],
    })],
  }));

  // Nicht-umlagefähig-Box
  elements.push(new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({
      children: [new TableCell({
        borders: allBorders,
        width: { size: CW, type: WidthType.DXA },
        shading: { fill: GRAY_BG, type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 100, bottom: 100, left: 160, right: 160 },
        children: [
          para([run(`Nicht umlagefähige Kosten (${fmt(numlSum)})`,
            { font: FONT_HEADING, size: 19, bold: true, color: DARK })], { after: 60 }),
          para([run(numlText, { size: 17 })]),
        ],
      })],
    })],
  }));

  return elements;
}

function buildEinzelabrechnung(owner: any, data: any, kiTexts: any): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  elements.push(new Paragraph({ children: [new PageBreak()] }));

  // Adressblock (2-spaltig, kein Rahmen)
  elements.push(new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: [CW / 2, CW / 2],
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({
      children: [
        new TableCell({
          borders: noBorders, width: { size: CW / 2, type: WidthType.DXA },
          children: [
            para([run("Eigentümer", { size: 16, color: MUTED, bold: true })]),
            para([run(`${owner.salutation ? owner.salutation + " " : ""}${owner.name}`, { size: 22, bold: true })], { before: 40 }),
            para([run(owner.addressStreet, { size: 18 })]),
            para([run(owner.addressCity, { size: 18 })]),
          ],
        }),
        new TableCell({
          borders: noBorders, width: { size: CW / 2, type: WidthType.DXA },
          children: [
            para([run("Wohneinheit", { size: 16, color: MUTED, bold: true })], { align: AlignmentType.RIGHT }),
            para([run(`Einheit ${owner.unitNumber}`, { size: 22, bold: true })], { before: 40, align: AlignmentType.RIGHT }),
            para([run(`MEA: ${fmtNum(Number(owner.mea) || 0)}`, { size: 18 })], { align: AlignmentType.RIGHT }),
            para([run(`Anteil im Zeitraum: ${Math.round(owner.timeProportion * 100)}%`, { size: 18, color: MUTED })], { align: AlignmentType.RIGHT }),
          ],
        }),
      ],
    })],
  }));

  elements.push(sectionHeading(`Einzelabrechnung ${data.fiscalYear}`));

  // 6-Spalten-Detailtabelle
  const dw = [800, CW - 800 - 1600 - 1500 - 1500 - 1700, 1600, 1500, 1500, 1700];
  const dRows: TableRow[] = [
    new TableRow({ tableHeader: true, children: [
      headerCell("Konto", dw[0]),
      headerCell("Bezeichnung", dw[1]),
      headerCell("Verteiler", dw[2]),
      headerCell("Gesamt", dw[3], { align: AlignmentType.RIGHT }),
      headerCell("Ihr Anteil", dw[4], { align: AlignmentType.RIGHT }),
      headerCell("Ihre Kosten", dw[5], { align: AlignmentType.RIGHT }),
    ]}),
  ];

  const groupOrder: Array<[string, string]> = [
    ["operating_distributable", "Umlagefähige Bewirtschaftungskosten"],
    ["heating", "Heizkosten (nach Brunata)"],
    ["operating_non_distributable", "Nicht umlagefähige Kosten"],
    ["reserve", "Erhaltungsrücklage"],
  ];

  groupOrder.forEach(([secId, label]) => {
    const rows = owner.accountBreakdown.filter((r: any) => r.displaySection === secId);
    if (rows.length === 0) return;
    dRows.push(sectionHeaderRow(label, 6));
    let subtotal = 0;
    rows.forEach((r: any) => {
      subtotal += r.ownerCost;
      dRows.push(new TableRow({ children: [
        dataCell(r.accountNumber, dw[0]),
        dataCell(r.accountName, dw[1]),
        dataCell(r.distLabel, dw[2]),
        dataCell(fmt(r.distributableAmount), dw[3], { align: AlignmentType.RIGHT }),
        dataCell(fmtNum(r.ownerShare), dw[4], { align: AlignmentType.RIGHT }),
        dataCell(fmt(r.ownerCost), dw[5], { align: AlignmentType.RIGHT, bold: true }),
      ]}));
    });
    dRows.push(new TableRow({ children: [
      dataCell("", dw[0], { shading: GRAY_BG }),
      dataCell(`Zwischensumme ${label}`, dw[1], { shading: GRAY_BG, italics: true, color: MUTED, colSpan: 4 }),
      // colSpan-Trick: weitere 3 Zellen nicht nötig — colSpan nimmt 4 Spalten
    ].concat([
      dataCell(fmt(subtotal), dw[5], { shading: GRAY_BG, align: AlignmentType.RIGHT, bold: true }),
    ]) }));
  });

  // Abrechnungssumme + Vorschuss + Ergebnis
  dRows.push(new TableRow({ children: [
    totalCell("", dw[0]),
    totalCell("Abrechnungssumme (Ihr Kostenanteil)", dw[1], { colSpan: 4 }),
    totalCell(fmt(owner.totalOwnerCost), dw[5], { align: AlignmentType.RIGHT }),
  ]}));
  dRows.push(new TableRow({ children: [
    dataCell("", dw[0]),
    dataCell("Vorschussverpflichtung (Hausgeld)", dw[1], { colSpan: 4 }),
    dataCell(fmt(owner.totalPaid), dw[5], { align: AlignmentType.RIGHT }),
  ]}));
  const resColor = owner.result >= 0 ? GREEN_TEXT : RED_TEXT;
  const resBg = owner.result >= 0 ? GREEN_BG : RED_BG;
  dRows.push(new TableRow({ children: [
    totalCell("", dw[0], { shading: resBg }),
    totalCell(`Ergebnis (${owner.result >= 0 ? "Guthaben" : "Nachzahlung"})`, dw[1],
      { colSpan: 4, shading: resBg, color: resColor }),
    totalCell(fmt(Math.abs(owner.result)), dw[5], { align: AlignmentType.RIGHT, shading: resBg, color: resColor }),
  ]}));

  elements.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: dw, rows: dRows }));

  // Ergebnis-Banner
  const bannerText = owner.result >= 0
    ? `✓  Guthaben: ${fmt(owner.result)}  –  wird zurückerstattet`
    : `!  Nachzahlung: ${fmt(Math.abs(owner.result))}  –  bitte überweisen`;
  elements.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 6, color: owner.result >= 0 ? TEAL : RED_TEXT, space: 8 },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: owner.result >= 0 ? TEAL : RED_TEXT, space: 8 },
    },
    children: [new TextRun({ text: bannerText, font: FONT_HEADING, size: 24, bold: true,
      color: owner.result >= 0 ? TEAL : RED_TEXT })],
  }));

  // §35a-Block
  if (owner.total35aDienste > 0 || owner.total35aHandwerker > 0) {
    elements.push(subHeading("§35a EStG Bescheinigung"));
    const wA = [CW - 2400, 2400];
    const dienstebonus = Math.min(owner.total35aDienste * 0.2, 4000);
    const handwerkerbonus = Math.min(owner.total35aHandwerker * 0.2, 1200);
    elements.push(new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: wA,
      rows: [
        new TableRow({ children: [
          dataCell("Haushaltsnahe Dienstleistungen (20 %, max. 4.000 €)", wA[0]),
          dataCell(fmt(owner.total35aDienste), wA[1], { align: AlignmentType.RIGHT }),
        ]}),
        new TableRow({ children: [
          dataCell("Handwerkerleistungen (20 %, max. 1.200 €)", wA[0]),
          dataCell(fmt(owner.total35aHandwerker), wA[1], { align: AlignmentType.RIGHT }),
        ]}),
        new TableRow({ children: [
          totalCell("Steuerbonus gesamt", wA[0]),
          totalCell(fmt(dienstebonus + handwerkerbonus), wA[1], { align: AlignmentType.RIGHT }),
        ]}),
      ],
    }));
  }

  // KI-Block
  const ki = kiTexts?.ownerTexts?.find((t: any) => t.assignmentId === owner.assignmentId);
  elements.push(...buildKiBlock(
    ki?.ergebnisText || KI_FALLBACK.ergebnis,
    ki?.umlText || KI_FALLBACK.uml, owner.umlSum,
    ki?.numlText || KI_FALLBACK.numl, owner.numlSum,
  ));

  return elements;
}

// ─────────── DOCUMENT ASSEMBLY ───────────
function buildDocument(data: any, kiTexts: any, ownerId?: string): Document {
  const owners = ownerId
    ? data.ownerResults.filter((o: any) => o.assignmentId === ownerId)
    : data.ownerResults;

  const headerTitle = ownerId
    ? `Einzelabrechnung ${data.fiscalYear}`
    : `WEG Jahresabrechnung ${data.fiscalYear}`;
  const headerSub = data.building?.address || data.building?.name || "";

  const children: (Paragraph | Table)[] = [];

  if (!ownerId) {
    children.push(...buildCoverPage(data));
    children.push(buildCoverInfoTable(data));
    children.push(...buildGesamtabrechnung(data, kiTexts));
  }
  owners.forEach((o: any) => {
    children.push(...buildEinzelabrechnung(o, data, kiTexts));
  });

  return new Document({
    styles: {
      default: { document: { run: { font: FONT_BODY, size: 20 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1400, right: 1000, bottom: 1100, left: 1000, header: 500, footer: 500 },
        },
      },
      headers: { default: makeHeader(headerTitle, headerSub) },
      footers: { default: makeFooter() },
      children,
    }],
  });
}

// ─────────── SERVE ───────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { buildingId, periodId, fiscalYear, ownerId } = await req.json();
    if (!buildingId || !periodId || !fiscalYear) {
      return new Response(JSON.stringify({ error: "buildingId, periodId, fiscalYear erforderlich" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const data = await loadSettlementData(supabase, buildingId, periodId, fiscalYear);
    const kiTexts = await generateKiTexts(data, ownerId).catch((e) => {
      console.error("KI-Texte fehlgeschlagen:", e);
      return null;
    });

    const doc = buildDocument(data, kiTexts, ownerId);
    const buffer = await Packer.toBuffer(doc);

    // Base64 encoding (chunked, damit kein Stack-Overflow bei großen Files)
    const u8 = new Uint8Array(buffer);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < u8.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(binary);

    const sanitize = (s: string) => (s || "").replace(/[^a-zA-Z0-9ÄÖÜäöüß_-]+/g, "_").replace(/^_+|_+$/g, "");
    const filename = ownerId
      ? `Einzelabrechnung_${sanitize(data.ownerResults.find((o: any) => o.assignmentId === ownerId)?.name || "Eigentuemer")}_${fiscalYear}.docx`
      : `WEG_Jahresabrechnung_${fiscalYear}_${sanitize(data.building?.name || "")}.docx`;

    return new Response(JSON.stringify({ docx: base64, filename }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-billing-docx error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unbekannter Fehler" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
