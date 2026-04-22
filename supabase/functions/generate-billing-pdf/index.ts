import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.52.1";
import {
  sumForAccount,
  getEffectiveOpeningBalance,
  getEffectiveClosingBalance,
} from "../_shared/booking-aggregation.ts";

// Account-Number-Patterns (Single Source of Truth, gleich wie Frontend)
const BANK_ACCOUNT_PATTERN = /^18\d{2}$/;        // 1800-1899 Banken (1800 Giro, 1810 Festgeld)
const RESERVE_ACCOUNT_PATTERN = /^17[0-9]\d$/;   // 1700-1799 Rücklagen-Bilanzkonten
const PERSONAL_ACCOUNT_PATTERN = /^0\d{3}$/;     // 0000-0999 Personenkonten

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const formatDate = (d: string) => new Date(d).toLocaleDateString("de-DE");

const DIST_KEY_LABELS: Record<string, string> = {
  mea: "MEA", einheiten: "Einheiten", einheit: "Einheiten", units: "Einheiten",
  qm: "Fläche (qm)", personen: "Personen",
  verbrauch_wasser: "Wasser", verbrauch_warmwasser: "Warmwasser",
  heizkostenverordnung: "Heizk.Abr.", heating_individual: "Heizk.Abr.",
  direkt: "direkt",
};

const DIST_KEY_TO_SHARE: Record<string, string> = {
  mea: "mea", einheiten: "einheit", units: "einheit", qm: "qm", personen: "personen",
  verbrauch_wasser: "wasser", verbrauch_warmwasser: "warmwasser",
  heizkostenverordnung: "heizkosten", heating_individual: "heizkosten",
};

const SECTION_LABELS: Record<string, string> = {
  income: "Einnahmen",
  operating_distributable: "Umlagefähige Ausgaben",
  operating_non_distributable: "Nicht umlagefähige Ausgaben",
  accrual: "Abgrenzungen",
  reserve: "Erhaltungsrücklage",
  reserve_withdrawal: "Rücklagenentnahme",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { buildingId, periodId, fiscalYear, ownerId } = await req.json();

    // Step 1: load period first to get exact date range (Bug 5 fix)
    const { data: period } = await supabase
      .from("billing_periods")
      .select("*")
      .eq("id", periodId)
      .single();

    if (!period) {
      return new Response(JSON.stringify({ error: "Abrechnungszeitraum nicht gefunden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: load all data in parallel
    const [
      { data: building },
      { data: accounts },
      // Bug 1 fix: include counter_account_id; Bug 5 fix: filter by booking_date range
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
        .select("id, account_id, counter_account_id, amount, booking_date, description, booking_category, is_35a_relevant, status")
        .eq("building_id", buildingId)
        .gte("booking_date", period.period_from)
        .lte("booking_date", period.period_to)
        .neq("status", "cancelled"),
      supabase.from("building_account_overrides").select("*").eq("building_id", buildingId),
      supabase.from("contact_building_assignments").select(`*, contacts(first_name, last_name, company_name, salutation, address_street, address_zip, address_city), contact_building_shares(*), contact_building_costs(*)`).eq("building_id", buildingId).eq("is_active", true).in("role_in_building", ["eigentuemer", "mieter"]),
      supabase.from("account_balances").select("*, chart_of_accounts(account_number, account_name, category, carry_forward_balance)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear),
      supabase.from("heating_distribution_values").select("*").eq("building_id", buildingId).eq("billing_period_id", periodId),
      supabase.from("economic_plans" as any).select("*, economic_plan_items(*)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear).maybeSingle(),
    ]);

    const periodLabel = `${formatDate(period.period_from)} – ${formatDate(period.period_to)}`;
    const allBookings = bookings || [];
    const allAccounts = accounts || [];
    const totalReserveFromPlan = (planItems as any)?.total_reserve != null
      ? Number((planItems as any).total_reserve)
      : 0;

    // Bug 4 fix: heating_repost-Buchungen rausfiltern (sonst doppelte Heizkosten auf 1400)
    const bookingsExclHeatingRepost = allBookings.filter(
      (b: any) => b.booking_category !== "heating_repost",
    );

    // Eröffnungskonto 4000 — wird für getEffective*Balance gebraucht
    const openingAccount = allAccounts.find((a: any) => a.account_number === "4000");
    const openingAccountId = openingAccount?.id ?? null;

    // Helpers
    const getDistKey = (accountId: string, defaultKey: string | null) => {
      const override = (overrides || []).find((o: any) => o.account_id === accountId);
      return override?.distribution_key || defaultKey || "mea";
    };

    const getTimeProportion = (assignment: any) => {
      if (!period) return 1;
      const periodStart = new Date(period.period_from).getTime();
      const periodEnd = new Date(period.period_to).getTime();
      const totalDays = (periodEnd - periodStart) / 86400000 + 1;
      const validFrom = assignment.valid_from ? new Date(assignment.valid_from).getTime() : periodStart;
      const validTo = assignment.valid_to ? new Date(assignment.valid_to).getTime() : periodEnd;
      const effectiveStart = Math.max(periodStart, validFrom);
      const effectiveEnd = Math.min(periodEnd, validTo);
      return Math.max(0, (effectiveEnd - effectiveStart) / 86400000 + 1) / totalDays;
    };

    // Day-precision Annualisierung (Bug 8): genaue Tage statt grober 12/4/1-Faktoren
    const periodDays = (() => {
      const s = new Date(period.period_from).getTime();
      const e = new Date(period.period_to).getTime();
      return (e - s) / 86400000 + 1;
    })();

    // Bug 1 fix: bank-zentrische Aggregation; heating_repost rausgefiltert für Heizkonto 1400
    const billingAccounts = allAccounts.filter((a: any) => a.is_billing_relevant || a.settlement_section);
    const accountTotals = billingAccounts.map((acc: any) => {
      const distKey = getDistKey(acc.id, acc.default_distribution_key);
      const sourceBookings = acc.is_heating_relevant
        ? bookingsExclHeatingRepost
        : allBookings;
      const total = sumForAccount(acc.id, sourceBookings as any);
      const absTotal = Math.abs(total);
      const wpItem = (planItems as any)?.economic_plan_items?.find((i: any) => i.account_id === acc.id);
      const wpAmount = wpItem ? Number(wpItem.planned_amount || 0) : 0;
      return { ...acc, total, absTotal, distKey, wpAmount };
    });

    // Sektionen — Bug 5: WP hat Vorrang, Buchungs-Summe als Fallback wenn Plan = 0
    const sectionOrder = ["income", "operating_distributable", "operating_non_distributable", "accrual", "reserve", "reserve_withdrawal"];
    const sections = sectionOrder.map(sec => {
      const accountsInSec = accountTotals.filter((a: any) => a.settlement_section === sec && a.absTotal > 0);
      let total = accountsInSec.reduce((s: number, a: any) => s + a.absTotal, 0);
      if (sec === "reserve" && totalReserveFromPlan > 0) {
        total = totalReserveFromPlan; // WP-Override
      }
      return {
        id: sec,
        label: SECTION_LABELS[sec] || sec,
        accounts: accountsInSec,
        total,
        wpTotal: accountTotals.filter((a: any) => a.settlement_section === sec).reduce((s: number, a: any) => s + a.wpAmount, 0),
      };
    }).filter(s => s.accounts.length > 0 || (s.id === "reserve" && s.total > 0));

    // Reserve-finanzierte Aufwände (1920 etc.) — Neutralisation auf Gesamt- und Eigentümerebene
    const reserveFundedAccounts = allAccounts.filter((a: any) => a.is_reserve_funded);
    const totalReserveWithdrawal = reserveFundedAccounts.reduce(
      (s: number, a: any) => s + Math.abs(sumForAccount(a.id, allBookings as any)),
      0,
    );

    // Bug 2 fix: Personenkonten + income-Sektion + Abgrenzungs-Bilanzkonten ausschließen
    const isAccrualBalanceAccount = (a: any) =>
      a.account_number === "4110" || a.account_number === "4130" || a.settlement_section === "accrual";
    const isHeatingPrepayAccount = (a: any) => a.settlement_section === "heating_prepayment";
    const isPersonalAccount = (a: any) => PERSONAL_ACCOUNT_PATTERN.test(a.account_number || "");
    const distributableAccounts = accountTotals.filter((a: any) =>
      a.is_distributable
      && !isPersonalAccount(a)                  // Bug 2: 0001-0999 raus
      && a.settlement_section !== "income"      // Bug 2: Einnahmen-Sektion raus
      && !isAccrualBalanceAccount(a)
      && !isHeatingPrepayAccount(a)
      && a.absTotal > 0
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

    // Bugs 1+3 fix: Anfangs-/Schlussbestände via getEffective*Balance + settlement_section + Pattern-Backup
    const isBankAccount = (a: any) =>
      a.settlement_section === "bank" || BANK_ACCOUNT_PATTERN.test(a.account_number || "");
    const isReserveBalanceAccount = (a: any) =>
      // Reserve-Bilanzkonto im Sinne von Vermögensbestand (Festgeld 1810 etc.) — NICHT Personenkonten/Aufwände
      (a.settlement_section === "reserve" || RESERVE_ACCOUNT_PATTERN.test(a.account_number || ""))
      && a.carry_forward_balance === true
      && !isPersonalAccount(a);

    const bankAccountsForBalance = allAccounts.filter(isBankAccount);
    const reserveAccountsForBalance = allAccounts.filter(isReserveBalanceAccount);
    const balancesArr = (balances || []) as any[];

    const sumOpening = (accs: any[]) =>
      accs.reduce((s, a) => s + getEffectiveOpeningBalance(a.id, allBookings as any, balancesArr, fiscalYear, openingAccountId).amount, 0);
    const sumClosing = (accs: any[]) =>
      accs.reduce((s, a) => {
        // Manueller closing_balance als Override, sonst berechnet
        const manual = balancesArr.find(b => b.account_id === a.id);
        if (manual && manual.closing_balance != null && Number(manual.closing_balance) !== 0) {
          return s + Number(manual.closing_balance);
        }
        return s + getEffectiveClosingBalance(a.id, allBookings as any, balancesArr, fiscalYear, openingAccountId).amount;
      }, 0);

    const openingGiro = sumOpening(bankAccountsForBalance);
    const openingRL = sumOpening(reserveAccountsForBalance);
    const closingGiro = sumClosing(bankAccountsForBalance);
    const closingRL = sumClosing(reserveAccountsForBalance);

    const totalIncome = sections.find(s => s.id === "income")?.total || 0;
    const totalExpenses = sections.filter(s => s.id !== "income").reduce((s, sec) => s + sec.total, 0);

    const personalAccounts = allAccounts.filter(
      (a: any) => PERSONAL_ACCOUNT_PATTERN.test(a.account_number) && a.account_number !== "0000"
    );
    const padUnit = (n: string | number | null | undefined) => {
      const s = String(n ?? "").replace(/\D/g, "");
      return s ? s.padStart(4, "0") : "";
    };

    // Per-owner results
    const ownerResults = (assignments || []).map((assignment: any) => {
      const contact = assignment.contacts;
      const name = contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unbekannt";
      const salutation = contact?.salutation || "";
      const shares = assignment.contact_building_shares || [];
      const costs = assignment.contact_building_costs || [];
      const timeProportion = getTimeProportion(assignment);

      const accountBreakdown: any[] = [];
      let totalOwnerCost = 0;
      let total35aDienste = 0;
      let total35aHandwerker = 0;
      let ownerReserveWithdrawal = 0;

      distributableAccounts.forEach((acc: any) => {
        const isHeating = acc.is_heating_relevant && acc.account_number === "1400";
        const heatingVal = isHeating
          ? (heatingValues || []).find((hv: any) => hv.assignment_id === assignment.id)
          : null;

        // Bug 4 fix: for reserve-funded expense accounts use distributable total; we'll neutralize at owner level
        const isReserveAcc = acc.settlement_section === "reserve";
        const total = isReserveAcc && totalReserveFromPlan > 0 ? totalReserveFromPlan : acc.absTotal;

        let ownerCost: number;
        let distLabel: string;
        let totalShares: number;
        let ownerShareValue: number;

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
              ? total * (ownerShareValue / totalShares) * timeProportion
              : 0;
          }
          distLabel = DIST_KEY_LABELS[distKey] || distKey;
        }

        if (ownerCost > 0) {
          accountBreakdown.push({
            accountNumber: acc.account_number,
            accountName: acc.account_name,
            distributableAmount: total,
            distLabel,
            totalShares,
            ownerShare: ownerShareValue,
            ownerCost,
          });
          totalOwnerCost += ownerCost;

          if (acc.settlement_35a_type === "dienste") total35aDienste += ownerCost;
          else if (acc.settlement_35a_type === "handwerker") total35aHandwerker += ownerCost;

          // Track owner share of reserve-funded expense (1920 etc.) for neutralization
          if (acc.is_reserve_funded) ownerReserveWithdrawal += ownerCost;
        }
      });

      // Bug 2 fix: Hausgeld bevorzugt aus Personenkonten-Buchungen (bank-zentrisch)
      const ownerAccount = personalAccounts.find(
        (a: any) => a.account_number === padUnit(assignment.unit_number)
      );

      const calcAnnual = (types: string[]) => costs
        .filter((c: any) => types.includes(c.cost_type))
        .reduce((s: number, c: any) => {
          const amount = Number(c.amount);
          switch (c.interval) {
            case "monatlich": return s + amount * 12;
            case "quartal": return s + amount * 4;
            case "jaehrlich": return s + amount;
            default: return s + amount * 12;
          }
        }, 0) * timeProportion;

      const annualHausgeld = ownerAccount
        ? Math.abs(sumForAccount(ownerAccount.id, allBookings as any))
        : calcAnnual(["hausgeld", "nebenkosten"]);
      const annualReserve = ownerAccount ? 0 : calcAnnual(["ruecklage"]);
      const totalPaid = annualHausgeld + annualReserve;

      // Bug 4 neutralization: subtract owner's share of reserve-funded expense from cost
      // (cost remains in breakdown for transparency, but doesn't double-charge)
      const netOwnerCost = totalOwnerCost - ownerReserveWithdrawal;
      const result = totalPaid - netOwnerCost;

      return {
        assignmentId: assignment.id,
        name,
        salutation,
        address: [contact?.address_street, [contact?.address_zip, contact?.address_city].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
        unitNumber: assignment.unit_number || "–",
        accountBreakdown,
        totalOwnerCost,
        ownerReserveWithdrawal,
        netOwnerCost,
        annualHausgeld,
        annualReserve,
        totalPaid,
        result,
        total35aDienste,
        total35aHandwerker,
        timeProportion,
      };
    });

    // ─── HTML STYLES (shared) ───
    const sharedStyles = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #1a1a1a; line-height: 1.4; }
      .page { width: 210mm; min-height: 297mm; padding: 20mm 18mm 15mm 18mm; position: relative; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .header-line { font-size: 8px; color: #888; border-bottom: 0.5px solid #ccc; padding-bottom: 3px; margin-bottom: 14px; }
      .recipient { margin-bottom: 16px; font-size: 10px; line-height: 1.5; }
      h1 { font-size: 15px; font-weight: 700; margin-bottom: 2px; }
      h2 { font-size: 11px; font-weight: 700; margin: 14px 0 4px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
      .subtitle { font-size: 10px; color: #555; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; margin: 4px 0 8px 0; font-size: 9.5px; }
      th { text-align: left; padding: 3px 6px; background: #f2f2f2; font-weight: 600; border-bottom: 1.5px solid #999; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.3px; }
      td { padding: 2.5px 6px; border-bottom: 0.5px solid #e0e0e0; }
      .r { text-align: right; }
      .mono { font-family: 'Courier New', monospace; font-size: 9px; }
      .section-total td { font-weight: 700; border-top: 1px solid #999; border-bottom: 1px solid #999; background: #fafafa; }
      .grand-total td { font-weight: 700; border-top: 2px solid #333; font-size: 10.5px; }
      .neutralize td { color: #166534; font-style: italic; }
      .result-box { margin: 12px 0; padding: 10px 14px; border-radius: 4px; font-size: 12px; font-weight: 700; }
      .result-positive { background: #ecfdf5; border: 1px solid #86efac; color: #166534; }
      .result-negative { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
      .footer { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; font-size: 7.5px; color: #aaa; border-top: 0.5px solid #ddd; padding-top: 3px; }
      .balance-row td { padding: 2px 6px; }
      .indent { padding-left: 20px !important; }
      .kto { width: 50px; font-family: 'Courier New', monospace; font-size: 9px; color: #666; }
    `;

    const footerHtml = `<div class="footer">${building?.manager_name || "Hausverwaltung"} · Erstellt am ${new Date().toLocaleDateString("de-DE")}</div>`;

    // ─── GESAMTABRECHNUNG HTML ───
    const generateGesamtHtml = () => {
      let sectionRows = "";

      sections.forEach(sec => {
        sectionRows += `<tr><td colspan="4" style="font-weight:700; padding-top:8px; font-size:10px;">${sec.label}</td></tr>`;
        sec.accounts.forEach(acc => {
          sectionRows += `<tr>
            <td class="kto">${acc.account_number}</td>
            <td>${acc.account_name}</td>
            <td class="r mono">${formatCurrency(acc.wpAmount)}</td>
            <td class="r mono">${formatCurrency(acc.absTotal)}</td>
          </tr>`;
        });
        sectionRows += `<tr class="section-total">
          <td></td>
          <td>Summe ${sec.label}</td>
          <td class="r mono">${formatCurrency(sec.wpTotal)}</td>
          <td class="r mono">${formatCurrency(sec.total)}</td>
        </tr>`;
      });

      const ownerRows = ownerResults.map(o =>
        `<tr>
          <td>${o.unitNumber}</td>
          <td>${o.name}</td>
          <td class="r mono">${formatCurrency(o.netOwnerCost)}</td>
          <td class="r mono">${formatCurrency(o.totalPaid)}</td>
          <td class="r mono" style="color:${o.result >= 0 ? '#166534' : '#991b1b'}">${formatCurrency(o.result)}</td>
        </tr>`
      ).join("");

      const totalOwnerCosts = ownerResults.reduce((s, o) => s + o.netOwnerCost, 0);
      const totalOwnerPaid = ownerResults.reduce((s, o) => s + o.totalPaid, 0);
      const totalOwnerResult = ownerResults.reduce((s, o) => s + o.result, 0);

      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${sharedStyles}</style></head><body>
        <div class="page">
          <div class="header-line">${building?.manager_name || "Hausverwaltung"} · ${building?.address || ""}</div>
          <h1>Gesamtabrechnung ${fiscalYear}</h1>
          <div class="subtitle">${building?.name || ""} · Abrechnungszeitraum: ${periodLabel}</div>

          <h2>Anfangsbestände</h2>
          <table>
            <tr class="balance-row"><td>Girokonto</td><td class="r mono">${formatCurrency(openingGiro)}</td><td></td><td></td></tr>
            <tr class="balance-row"><td>Erhaltungsrücklage</td><td class="r mono">${formatCurrency(openingRL)}</td><td></td><td></td></tr>
            <tr class="section-total"><td><strong>Gesamtvermögen Anfang</strong></td><td class="r mono"><strong>${formatCurrency(openingGiro + openingRL)}</strong></td><td></td><td></td></tr>
          </table>

          <h2>Einnahmen und Ausgaben</h2>
          <table>
            <tr><th class="kto">Konto</th><th>Bezeichnung</th><th class="r">Wirtschaftsplan</th><th class="r">Ist-Betrag</th></tr>
            ${sectionRows}
            ${totalReserveWithdrawal > 0 ? `
            <tr class="neutralize">
              <td></td>
              <td colspan="2">./. Entnahme aus Erhaltungsrücklage (Neutralisation)</td>
              <td class="r mono">- ${formatCurrency(totalReserveWithdrawal)}</td>
            </tr>` : ""}
          </table>

          <h2>Endbestände</h2>
          <table>
            <tr class="balance-row"><td>Girokonto</td><td class="r mono">${formatCurrency(closingGiro)}</td><td></td><td></td></tr>
            <tr class="balance-row"><td>Erhaltungsrücklage</td><td class="r mono">${formatCurrency(closingRL)}</td><td></td><td></td></tr>
            <tr class="section-total"><td><strong>Gesamtvermögen Ende</strong></td><td class="r mono"><strong>${formatCurrency(closingGiro + closingRL)}</strong></td><td></td><td></td></tr>
          </table>

          <h2>Verteilung auf Eigentümer</h2>
          <table>
            <tr><th>Einheit</th><th>Eigentümer</th><th class="r">Kostenanteil</th><th class="r">Vorauszahlungen</th><th class="r">Ergebnis</th></tr>
            ${ownerRows}
            <tr class="grand-total">
              <td></td><td>Gesamt</td>
              <td class="r mono">${formatCurrency(totalOwnerCosts)}</td>
              <td class="r mono">${formatCurrency(totalOwnerPaid)}</td>
              <td class="r mono">${formatCurrency(totalOwnerResult)}</td>
            </tr>
          </table>

          ${footerHtml}
        </div>
      </body></html>`;
    };

    // ─── EINZELABRECHNUNG HTML ───
    const generateEinzelHtml = (owner: any) => {
      const resultLabel = owner.result >= 0 ? "Guthaben" : "Nachzahlung";
      const resultClass = owner.result >= 0 ? "result-positive" : "result-negative";

      const breakdownRows = owner.accountBreakdown.map((row: any) =>
        `<tr>
          <td class="kto">${row.accountNumber}</td>
          <td>${row.accountName}</td>
          <td class="r mono">${formatCurrency(row.distributableAmount)}</td>
          <td style="text-align:center; font-size:8.5px">${row.distLabel}</td>
          <td class="r mono">${typeof row.totalShares === 'number' ? row.totalShares.toLocaleString("de-DE") : '–'}</td>
          <td class="r mono">${typeof row.ownerShare === 'number' ? row.ownerShare.toLocaleString("de-DE") : '–'}</td>
          <td class="r mono">${formatCurrency(row.ownerCost)}</td>
        </tr>`
      ).join("");

      let para35a = "";
      if (owner.total35aDienste > 0 || owner.total35aHandwerker > 0) {
        const diensteBonus = Math.min(owner.total35aDienste * 0.2, 4000);
        const handwerkerBonus = Math.min(owner.total35aHandwerker * 0.2, 1200);
        para35a = `
          <h2>Bescheinigung gemäß §35a EStG</h2>
          <table>
            <tr><th>Kategorie</th><th class="r">Anteilige Kosten</th><th class="r">Steuerermäßigung (20%)</th></tr>
            ${owner.total35aDienste > 0 ? `<tr><td>Haushaltsnahe Dienstleistungen</td><td class="r mono">${formatCurrency(owner.total35aDienste)}</td><td class="r mono">${formatCurrency(diensteBonus)}</td></tr>` : ""}
            ${owner.total35aHandwerker > 0 ? `<tr><td>Handwerkerleistungen</td><td class="r mono">${formatCurrency(owner.total35aHandwerker)}</td><td class="r mono">${formatCurrency(handwerkerBonus)}</td></tr>` : ""}
            <tr class="section-total">
              <td><strong>Gesamt</strong></td>
              <td class="r mono"><strong>${formatCurrency(owner.total35aDienste + owner.total35aHandwerker)}</strong></td>
              <td class="r mono"><strong>${formatCurrency(diensteBonus + handwerkerBonus)}</strong></td>
            </tr>
          </table>
          <p style="font-size:8px; color:#666; margin-top:4px;">Die Steuerermäßigung für haushaltsnahe Dienstleistungen beträgt max. 4.000 €, für Handwerkerleistungen max. 1.200 € pro Jahr.</p>
        `;
      }

      // Bug 4 fix: explicit reserve-funded neutralization line
      const reserveLine = owner.ownerReserveWithdrawal > 0
        ? `<tr class="neutralize"><td>./. Entnahme aus Erhaltungsrücklage (Reparatur aus Rücklage)</td><td class="r mono">- ${formatCurrency(owner.ownerReserveWithdrawal)}</td></tr>`
        : "";

      return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${sharedStyles}</style></head><body>
        <div class="page">
          <div class="header-line">${building?.manager_name || "Hausverwaltung"} · ${building?.address || ""}</div>
          <div class="recipient">
            ${owner.salutation ? owner.salutation + "<br>" : ""}${owner.name}<br>${(owner.address || "").replace(/\n/g, "<br>")}
          </div>

          <h1>Einzelabrechnung ${fiscalYear}</h1>
          <div class="subtitle">
            ${building?.name || ""} · Einheit ${owner.unitNumber} · ${periodLabel}
            ${owner.timeProportion < 1 ? ` · Zeitanteilig: ${Math.round(owner.timeProportion * 100)}%` : ""}
          </div>

          <h2>Kostenverteilung</h2>
          <table>
            <tr>
              <th class="kto">Konto</th>
              <th>Bezeichnung</th>
              <th class="r">Gesamt</th>
              <th style="text-align:center">Verteiler</th>
              <th class="r">Ges.-Anteil</th>
              <th class="r">Ihr Anteil</th>
              <th class="r">Ihre Kosten</th>
            </tr>
            ${breakdownRows}
            <tr class="grand-total">
              <td></td>
              <td colspan="5"><strong>Summe Kostenanteil (brutto)</strong></td>
              <td class="r mono"><strong>${formatCurrency(owner.totalOwnerCost)}</strong></td>
            </tr>
          </table>

          <h2>Abrechnungsergebnis</h2>
          <table>
            <tr><td>Ihr Kostenanteil (brutto)</td><td class="r mono">${formatCurrency(owner.totalOwnerCost)}</td></tr>
            ${reserveLine}
            <tr><td><strong>Ihr Kostenanteil (netto)</strong></td><td class="r mono"><strong>${formatCurrency(owner.netOwnerCost)}</strong></td></tr>
            <tr><td>./. Hausgeld-Vorauszahlungen</td><td class="r mono">- ${formatCurrency(owner.annualHausgeld)}</td></tr>
            ${owner.annualReserve > 0 ? `<tr><td>./. Rücklagenzuführung</td><td class="r mono">- ${formatCurrency(owner.annualReserve)}</td></tr>` : ""}
            <tr class="grand-total"><td><strong>${resultLabel}</strong></td><td class="r mono"><strong>${formatCurrency(Math.abs(owner.result))}</strong></td></tr>
          </table>

          <div class="result-box ${resultClass}">
            ${resultLabel}: ${formatCurrency(Math.abs(owner.result))}
            ${owner.result < 0
              ? " — Bitte überweisen Sie den Betrag innerhalb von 30 Tagen."
              : " — Das Guthaben wird Ihrem Konto gutgeschrieben."}
          </div>

          ${para35a}

          ${footerHtml}
        </div>
      </body></html>`;
    };

    // ─── RESPONSE ───
    const storeAndRespond = async (html: string, fileName: string) => {
      const safeName = fileName.replace(/[^a-zA-Z0-9äöüÄÖÜ._-]/g, "_");
      const filePath = `billing-pdfs/${buildingId}/${fiscalYear}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("building-documents")
        .upload(filePath, new Blob([html], { type: "text/html; charset=utf-8" }), {
          upsert: true,
          contentType: "text/html; charset=utf-8",
        });
      if (uploadError) console.error("upload error:", uploadError);
      const { data: signedUrl } = await supabase.storage
        .from("building-documents")
        .createSignedUrl(filePath, 3600);
      return new Response(JSON.stringify({ url: signedUrl?.signedUrl, html }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    };

    if (ownerId) {
      const owner = ownerResults.find((o: any) => o.assignmentId === ownerId);
      if (!owner) {
        return new Response(JSON.stringify({ error: "Eigentümer nicht gefunden" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const html = generateEinzelHtml(owner);
      return storeAndRespond(html, `Einzelabrechnung_${fiscalYear}_${owner.name}.html`);
    }

    const html = generateGesamtHtml();
    return storeAndRespond(html, `Gesamtabrechnung_${fiscalYear}_${building?.name || "Liegenschaft"}.html`);

  } catch (error: any) {
    console.error("generate-billing-pdf error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
