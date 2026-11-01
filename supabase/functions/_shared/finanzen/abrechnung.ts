// ============================================================
// Jahresabrechnung — gemeinsame Berechnung (UI + Server)
// ------------------------------------------------------------
// Single Source of Truth für die Jahresabrechnung. Wird verwendet von
//   - src/components/finance/BillingSettlement.tsx (UI, via @shared/finanzen/abrechnung.ts)
//   - Edge Functions (Deno), die Abrechnungsdokumente serverseitig erzeugen.
//
// Der Rechenkern (berechneAbrechnung) ist 1:1 aus BillingSettlement.tsx
// herausgelöst (Closures → innere Funktionen mit expliziten Eingaben).
// Nichts wurde "verbessert" — Zahlen müssen identisch bleiben.
//
// Deno-kompatibel: nur relative Imports mit .ts-Endung, kein React,
// kein Supabase-Client-Import, keine DOM-APIs.
// ============================================================

import { ladeBuchungenZeitraum, ladeIstZahlungen, ladeWirtschaftsplanPositionen } from "./abfragen.ts";
import { getEffectiveOpeningBalance, getEffectiveClosingBalance, signedTotalForAccount } from "./bookingAggregation.ts";
import { getAccrualDisplaySign } from "./accrualSign.ts";
import {
  buildOverallPayload,
  buildOwnerPayload,
  buildAssetReportPayload,
  type BillingPayloadInputs,
} from "./buildBillingPayload.ts";
import { unitFilePrefix } from "./unitFilePrefix.ts";
import {
  dmsAblageGesamtabrechnung,
  dmsAblageEinzelabrechnung,
  dmsAblageVermoegensbericht,
  type DmsAblageInfo,
} from "./dmsAblage.ts";

// Mapping Verteilerschlüssel → share_type (in contact_building_shares).
// Identisch zur Liste im Wirtschaftsplan-Editor + Personen-Tab (siehe src/lib/shareTypes.ts).
// Identitäts-Mapping für alle in SHARE_TYPES definierten Keys + Custom-MEA-Varianten,
// damit Custom-Schlüssel (Whg.-MEA, Gar.-MEA, Sonder-MEA, stellplaetze, garagen, ...)
// genau so verteilt werden wie in der Personen-/Anteils-Pflege gespeichert.
export const DIST_KEY_TO_SHARE: Record<string, string> = {
  // Standard-Aliase
  mea: "mea",
  einheiten: "einheit", einheit: "einheit", units: "einheit",
  qm: "qm", personen: "personen",
  garagen: "garagen", stellplaetze: "stellplaetze",
  verbrauch_wasser: "wasser", wasser: "wasser",
  verbrauch_warmwasser: "warmwasser", warmwasser: "warmwasser",
  heizkostenverordnung: "heizkosten", heating_individual: "heizkosten",
  heizkosten: "heizkosten", heizk_abr: "heizkosten", "heizk.abr": "heizkosten",
  verbrauch_heizung: "heizkosten",
  direkt: "direkt",
  // Custom-MEA-Varianten (case-insensitive Lookup über getShareType unten)
  "whg.-mea": "Whg.-MEA",
  "gar.-mea": "Gar.-MEA",
  "sonder-mea": "Sonder-MEA",
};

// Robuster Lookup: Identitäts-Fallback für unbekannte Custom-Keys,
// damit jeder in der DB gepflegte share_type direkt verteilt werden kann.
export const getShareType = (distKey: string): string => {
  if (!distKey) return "mea";
  const lower = distKey.toLowerCase();
  return DIST_KEY_TO_SHARE[lower] || DIST_KEY_TO_SHARE[distKey] || distKey;
};

export const SHARE_LABELS: Record<string, string> = {
  mea: "Ges.Tausendstel", einheit: "Einheiten", qm: "Wohnfläche (m²)",
  personen: "Personen", wasser: "Wasserverbr.", warmwasser: "Warmwasserverbr.",
  heizkosten: "Heizk.Abr.", direkt: "Direkt",
  garagen: "Garagen", stellplaetze: "Stellplätze",
  "Whg.-MEA": "Whg.-MEA", "Gar.-MEA": "Gar.-MEA", "Sonder-MEA": "Sonder-MEA",
};

// ============================================================
//  Typen
// ============================================================

/** Rohdaten = Ergebnisse der Abfragen (UI: react-query Hooks, Server: ladeAbrechnungsDaten). */
export interface AbrechnungsRohdaten {
  buildingId: string;
  periodId?: string | null;
  fiscalYear: number;
  /** billing_periods-Zeile (kann in der UI kurzzeitig undefined sein) */
  period: any | null | undefined;
  /** chart_of_accounts (building_id null ODER = buildingId), sortiert nach account_number */
  accounts: any[];
  /** building_account_overrides */
  overrides: any[];
  /** bookings im Zeitraum (ungefiltert — der Filter auf bekannte Konten passiert in berechneAbrechnung) */
  rawBookings: any[];
  /** IST-Zahlungen auf Personenkonten (nur bei useIstVorschuss geladen, sonst []) */
  istPayments: any[];
  /** contact_building_assignments inkl. distribution_only-Merge (siehe mergeDistributionOnlyShares) */
  assignments: any[];
  /** buildings-Zeile (name, address, building_code, unit_count, unit_count_for_billing) */
  building: any;
  /** economic_plans { total_reserve } | null */
  economicPlan: any;
  /** account_balances inkl. chart_of_accounts-Join */
  balances: any[];
  /** economic_plan_items des Plans desselben Jahres (account_id, planned_amount) */
  wpItems: any[];
  /** heating_distribution_values der Periode */
  heatingDistValues: any[];
  /** offene Rechnungen (aktuell nicht in Berechnung/Payloads verwendet) */
  openInvoices?: any[];
}

export interface AbrechnungsOptionen {
  /** SOLL/IST-Toggle "IST-Vorschüsse verwenden" */
  useIstVorschuss: boolean;
  /** Toggle "Null-Saldo Konten anzeigen" */
  showZeroBalanceAccounts: boolean;
}

export type DistWarning = {
  accountNumber: string;
  accountName: string;
  amount: number;
  distributionKey: string;
  reason: string;
};

export type AbrechnungsErgebnis = ReturnType<typeof berechneAbrechnung>;
export type OwnerResult = AbrechnungsErgebnis["ownerResults"][number];

// ============================================================
//  Rechenkern
// ============================================================

export function berechneAbrechnung(input: AbrechnungsRohdaten, optionen: AbrechnungsOptionen) {
  const {
    buildingId,
    fiscalYear,
    period,
    accounts,
    overrides,
    rawBookings,
    istPayments,
    assignments,
    building,
    economicPlan,
    balances,
    wpItems,
    heatingDistValues,
  } = input;
  const { useIstVorschuss, showZeroBalanceAccounts } = optionen;

  // ---- aus BillingSettlement.tsx (Defense-in-depth Buchungsfilter) ----
  // Defense-in-depth: keep bookings that touch a known account on either side
  const validAccountIds = new Set(accounts.map(a => a.id));
  const bookings = rawBookings.filter(b =>
    (!b.account_id && !b.counter_account_id) ||
    (b.account_id && validAccountIds.has(b.account_id)) ||
    (b.counter_account_id && validAccountIds.has(b.counter_account_id))
  );

  // ---- aus BillingSettlement.tsx: Computation helpers … ownerResults ----
  const getDistKey = (accountId: string, defaultKey: string | null) => {
    const override = overrides.find((o) => o.account_id === accountId);
    return override?.distribution_key || defaultKey || "mea";
  };

  // Doppelte Buchführung — IDENTISCH zu useAccountAggregation / AccountPlanView,
  // damit beide Ansichten zwingend dieselben Zahlen liefern.
  //
  //   account_id-Seite:         sign = booking_type === "income" ? +1 : -1
  //   counter_account_id-Seite: booking_type wird gedreht, dann derselbe Vorzeichen-Mapper
  //
  // Konvention der Rückgabe: signiert.
  //   - Aufwandskonten (1xxx): negativer Wert (z. B. Allgemeinstrom = -155,68)
  //   - Ertragskonten:         positiver Wert
  //   - Erstattungen / Umbuchungen wirken automatisch auf BEIDEN Konten korrekt
  //     (z. B. Heizungsstrom-Repost: −167,51 auf 1050, +167,51 auf 1400) — KEIN Sonderpfad nötig.
  const getAccountBookingTotal = (accountId: string): number =>
    signedTotalForAccount(accountId, bookings as any);

  // Anzeigewert für klassische „Kostensumme" — Magnitude, ohne Vorzeichen.
  // Wird für Verteilungsrechnung, Warnungen, Schwellwerte und Legacy-Aufrufer genutzt.
  const getAccountAbsTotal = (accountId: string) => Math.abs(getAccountBookingTotal(accountId));

  const getWpAmount = (accountId: string) => {
    // Plan-Beträge sind teils negativ (Kosten) gespeichert – angezeigt wird der Betrag
    const item = wpItems.find((w: any) => w.account_id === accountId);
    return item ? Math.abs(Number(item.planned_amount) || 0) : 0;
  };

  // Group accounts by settlement_section
  // total = signiert (so kommt's aus der Aggregation), totalAbs = Magnitude für Verteilung/Anzeige
  const sectionAccounts: Record<string, Array<any & { total: number; totalAbs: number; wpAmount: number; distKey: string }>> = {};
  accounts.forEach((acc) => {
    const section = acc.settlement_section;
    if (!section) return;
    // Inline-Toggle "Abrechnungsrelevant":
    //  - explizit false  → immer ausblenden
    //  - sonst: Konten mit Saldo ≈ 0 standardmäßig ausblenden (auch wenn Flag = true);
    //    Toggle "Null-Saldo Konten anzeigen" macht sie wieder sichtbar.
    //    Reserve-Sektion ist Ausnahme (immer anzeigen).
    const billingFlag = (acc as any).is_billing_relevant;
    if (billingFlag === false) return;
    const total = getAccountBookingTotal(acc.id);
    if (Math.abs(total) < 0.005 && section !== "reserve" && !showZeroBalanceAccounts) return;
    if (!sectionAccounts[section]) sectionAccounts[section] = [];
    sectionAccounts[section].push({
      ...acc,
      total,
      totalAbs: Math.abs(total),
      wpAmount: getWpAmount(acc.id),
      distKey: getDistKey(acc.id, acc.default_distribution_key),
    });
  });

  // Calculate totals per section — Magnitude (für Abrechnungssumme & klassische Anzeige)
  const getSectionTotal = (section: string) =>
    (sectionAccounts[section] || []).reduce((s, a) => s + a.totalAbs, 0);

  // Signierte Sektionssumme (Income +, Expense -) — für Anzeige mit + / − Präfix
  const getSectionSignedTotal = (section: string) =>
    (sectionAccounts[section] || []).reduce((s, a) => s + a.total, 0);

  const totalIncome = getSectionTotal("income");
  const totalOperatingDist = getSectionTotal("operating_distributable");
  const totalOperatingNonDist = getSectionTotal("operating_non_distributable");
  const totalAccrual = getSectionTotal("accrual");
  // IHR-Zuführung kommt aus der tatsächlich gebuchten Rücklagenbildung.
  // Fallback: WP-Wert, falls noch keine Buchung auf Plan-IHR-Konten (193x) vorliegt.
  // NUR Plan-IHR-Konten (193x = Planmäßige IHR), niemals Bestandskonten
  // (1810/1820 = Rücklagenkonto / Bestand) — diese gehören in den Vermögensbericht,
  // nicht in die Abrechnungssumme.
  const isPlanIhrAccount = (a: any) => /^193\d$/.test(String(a.account_number || ""));
  const reserveFromBookings = (sectionAccounts["reserve"] || [])
    .filter(isPlanIhrAccount)
    .reduce((s: number, a: any) => s + (a.totalAbs || 0), 0);
  const planReserveTotal = Number(economicPlan?.total_reserve) || 0;
  const totalReserve = reserveFromBookings > 0 ? reserveFromBookings : planReserveTotal;
  // Bug 4 fix: rücklagenfinanzierte Aufwandskonten via Flag erkennen (z. B. Konto 1920),
  // statt fragiler reserve_withdrawal-Section. Skaliert auf zukünftige Konten (z. B. 1921).
  // Erkennung: reserve_role='withdrawal' (neu, generisch) ODER is_reserve_funded (Legacy).
  const isReserveWithdrawalAccount = (a: any) => a.reserve_role === "withdrawal" || a.is_reserve_funded === true;
  const reserveFundedAccounts = accounts.filter(isReserveWithdrawalAccount);
  const totalReserveWithdrawal = reserveFundedAccounts.reduce(
    (s, a: any) => s + Math.abs(getAccountBookingTotal(a.id)),
    0,
  ) || getSectionTotal("reserve_withdrawal");

  // Opening balances — bevorzugt aus Eröffnungsbuchungen gegen Konto 4000,
  // Fallback auf manuellen Eintrag in account_balances.
  const opening4000Account = accounts.find((a: any) => a.account_number === "4000");
  const opening4000Id = opening4000Account?.id || null;
  // Konto 4000 (Eröffnungsbuchungen) und 4900/4910 (ARAP/PRAP) sind technische
  // Gegenkonten bzw. Abgrenzungen — keine echten Bestandskonten. Ausschließen,
  // damit sie nicht als "Sonstige Bestandskonten" in den Endbeständen auftauchen.
  const carryAccounts = accounts.filter(
    (a: any) =>
      a.carry_forward_balance &&
      a.settlement_section !== "opening" &&
      a.settlement_section !== "accrual",
  );
  const flatBalances = balances.map((b: any) => ({
    account_id: b.account_id,
    opening_balance: b.opening_balance,
  }));
  const openingByAccount: Record<string, number> = {};
  const closingByAccount: Record<string, number> = {};
  carryAccounts.forEach((acc: any) => {
    const eff = getEffectiveOpeningBalance(acc.id, bookings as any[], flatBalances, fiscalYear, opening4000Id);
    openingByAccount[acc.id] = eff.amount;
    const close = getEffectiveClosingBalance(acc.id, bookings as any[], flatBalances, fiscalYear, opening4000Id);
    closingByAccount[acc.id] = close.amount;
  });
  // Klassifizierung der Bestandskonten (Anfangs-/Endbestände).
  // WICHTIG: "Girokonto" darf NUR echte Bankkonten enthalten (1800/1801…),
  // sonst werden Brennstoffrestbestand (1450) und Vorauszahlungen (1470–1473)
  // fälschlich in den Giro-Saldo eingerechnet.
  const isBankAccount = (a: any) =>
    typeof a.account_number === "string" && /^180\d?$/.test(a.account_number);
  const isReserveAccount = (a: any) =>
    /^181\d$/.test(String(a.account_number || "")) || a.account_number === "1820";
  const isFuelStockAccount = (a: any) => a.account_number === "1450";
  const isHeatingPrepayBalanceAccount = (a: any) =>
    ["1470", "1471", "1472", "1473"].includes(a.account_number) ||
    a.settlement_section === "heating_prepayment";

  const sumOpening = (filter: (a: any) => boolean) =>
    carryAccounts.filter(filter).reduce((s: number, a: any) => s + (openingByAccount[a.id] || 0), 0);

  const openingGiro = sumOpening(isBankAccount);
  const openingReserve = sumOpening(isReserveAccount);
  const openingFuel = sumOpening(isFuelStockAccount);
  const openingPrepay = sumOpening(isHeatingPrepayBalanceAccount);
  const openingOther = sumOpening((a: any) =>
    !isBankAccount(a) && !isReserveAccount(a) && !isFuelStockAccount(a) && !isHeatingPrepayBalanceAccount(a),
  );
  const openingTotal =
    Math.abs(openingGiro) + Math.abs(openingReserve) + Math.abs(openingFuel) +
    Math.abs(openingPrepay) + Math.abs(openingOther);

  // Closing balances — strikt das Bewegungs-Saldo (Bank-Zentrik), identisch zur
  // Anzeige in der oberen Konten-Liste.
  // WICHTIG: Manuelle account_balances.closing_balance werden NICHT mehr als Override
  // verwendet — die Werte sind in vielen Liegenschaften veraltet (z. B. Birkenweg 6:
  // 1800=32.223,14 statt buchhalterisch korrekt 4.378,64). Der einzig zuverlässige
  // Endsaldo ergibt sich aus Eröffnungsbuchung 4000 + alle Bewegungen (= signedTotalForAccount
  // über alle Buchungen, da die 4000-Buchung das Konto bereits mit dem Anfangsbestand
  // belastet/entlastet).
  const getClosing = (acc: any) => {
    // signedTotalForAccount ist booking_type-aware: Bei bank-zentrischen
    // Buchungen werden income (+) und expense (−) korrekt saldiert. sumForAccount
    // würde stattdessen alle Beträge auf der Bankseite gleich aufsummieren.
    return signedTotalForAccount(acc.id, bookings as any);
  };
  const sumClosing = (filter: (a: any) => boolean) =>
    carryAccounts.filter(filter).reduce((s: number, a: any) => s + getClosing(a), 0);

  const closingGiro = sumClosing(isBankAccount);
  const closingReserve = sumClosing(isReserveAccount);
  const closingFuel = sumClosing(isFuelStockAccount);
  const closingPrepay = sumClosing(isHeatingPrepayBalanceAccount);
  const closingOther = sumClosing((a: any) =>
    !isBankAccount(a) && !isReserveAccount(a) && !isFuelStockAccount(a) && !isHeatingPrepayBalanceAccount(a),
  );
  const closingTotal =
    Math.abs(closingGiro) + Math.abs(closingReserve) + Math.abs(closingFuel) +
    Math.abs(closingPrepay) + Math.abs(closingOther);

  // Per-Konto Liste der Bestandskonten (für DOCX-Loop {#bestaende_anfang}/{#bestaende_ende})
  const carryAccountsList = carryAccounts.map((acc: any) => {
    const cat: "bank" | "reserve" | "fuel" | "prepay" | "other" = isBankAccount(acc) ? "bank"
      : isReserveAccount(acc) ? "reserve"
      : isFuelStockAccount(acc) ? "fuel"
      : isHeatingPrepayBalanceAccount(acc) ? "prepay"
      : "other";
    return {
      account_number: acc.account_number,
      account_name: acc.account_name,
      opening: openingByAccount[acc.id] || 0,
      closing: getClosing(acc),
      category: cat,
    };
  });

  // Rücklagenkonten einzeln (statt einer Summenzeile) für die Bestände-Anzeige.
  // Sortiert nach Kontonummer; Anzeige gefiltert nach non-zero je Block.
  const reserveAccountsList = carryAccountsList
    .filter((a) => a.category === "reserve")
    .sort((a, b) => String(a.account_number).localeCompare(String(b.account_number)));

  // Distributable total (für Einzelabrechnung) — exclude:
  //  - ARAP/PRAP (4110/4130 = Bilanzkonten, kein Aufwand)
  //  - heating_prepayment Vorauszahlungskonten (1470–1473): reine Durchlaufkonten
  const isAccrualBalanceAccount = (a: any) =>
    a.account_number === "4110" || a.account_number === "4130" || a.settlement_section === "accrual";
  const isHeatingPrepayAccount = (a: any) => a.settlement_section === "heating_prepayment";
  const totalDistributable = accounts
    .filter((a) => a.is_distributable && !isAccrualBalanceAccount(a) && !isHeatingPrepayAccount(a))
    .reduce((s, a) => s + getAccountAbsTotal(a.id), 0);

  // Abrechnungssumme — HV-Office-konform:
  // Es zählen alle VERTEILUNGSRELEVANTEN Aufwandskonten der Sektionen
  // (operating_distributable, operating_non_distributable, heating) plus
  // Plan-IHR aus dem Wirtschaftsplan plus vorzeichenrichtige Abgrenzungen.
  // Nicht enthalten: ARAP/PRAP-Bilanzkonten, Heating-Vorauszahlungen,
  // Bilanzkonten 145x (Brennstoffrestbestand) und Bestandskonten 1810/1820/193x
  // (die gehören in den Vermögensbericht bzw. werden separat als Plan-IHR addiert).
  const isBalanceSheetAccount = (a: any) => {
    const num = String(a.account_number || "");
    return /^145\d$/.test(num)            // Brennstoffrestbestand
        || /^181\d$/.test(num) || /^182\d$/.test(num)  // Rücklagen-Bestand
        || /^193\d$/.test(num);           // Plan-IHR (separat als totalReserve)
  };
  const getSectionDistributable = (section: string) =>
    (sectionAccounts[section] || [])
      .filter((a: any) =>
           a.is_distributable
        && !isAccrualBalanceAccount(a)
        && !isHeatingPrepayAccount(a)
        // In der Sektion "reserve" ist 193x das verteilungsrelevante Konto und
        // muss genau einmal gezählt werden — nicht als Bilanzkonto wegfiltern.
        && (section === "reserve" ? true : !isBalanceSheetAccount(a)))
      .reduce((s: number, a: any) => s + Math.abs(a.totalAbs || 0), 0);
  const totalOperatingDistRelevant = getSectionDistributable("operating_distributable");
  const totalOperatingNonDistRelevant = getSectionDistributable("operating_non_distributable");
  const totalHeatingRelevant = getSectionDistributable("heating");
  // IHR-Zuführung wird über die Sektion "reserve" (Konto 193x bzw. die in der
  // Sektion eingehängten Konten) ein einziges Mal gezählt — KEIN zusätzlicher
  // Aufschlag aus economicPlan.total_reserve mehr, da das zu Doppelzählung
  // gegenüber dem PDF (sumVerteilbar) führte.
  const totalReserveRelevant = getSectionDistributable("reserve");
  // Abgrenzungen vorzeichenrichtig (4100/4180 negativ, 4120/4160 positiv)
  const totalAccrualRelevant = (sectionAccounts["accrual"] || [])
    .reduce((s: number, a: any) => s + (a.totalAbs || 0) * getAccrualDisplaySign(a.account_number), 0);
  // Einheitliche Abrechnungssumme — identisch zu sumVerteilbar im PDF-Payload.
  const abrechnungssumme =
      totalOperatingDistRelevant
    + totalOperatingNonDistRelevant
    + totalHeatingRelevant
    + totalReserveRelevant
    - totalReserveWithdrawal; // Entnahmen mindern
  // Hinweis: totalAccrualRelevant ist bewusst NICHT Teil der Abrechnungssumme.
  // Abgrenzungen werden nur nachrichtlich ausgewiesen (Vermögensbericht).

  // ISO-Datum (YYYY-MM-DD) als LOKALES Datum parsen — verhindert UTC-Drift,
  // bei der z. B. '2025-01-01' in DE-Zeitzone als 31.12.2024 23:00 interpretiert wird
  // und dadurch der 01.01. aus der Gültigkeit fällt (führte zu falscher Überzahlung).
  const parseLocalDate = (s: string | null | undefined): Date | null => {
    if (!s) return null;
    const m = String(s).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return new Date(s);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };

  // Monatlicher Äquivalentbetrag aus interval + amount.
  const monthlyEquivOfCost = (c: any): number => {
    const amount = Number(c.amount) || 0;
    switch (c.interval) {
      case "monatlich": return amount;
      case "quartal":   return amount / 3;
      case "jaehrlich": return amount / 12;
      default:          return amount;
    }
  };

  // Soll-Jahresbetrag: zählt für jeden Monat im Abrechnungszeitraum den Betrag,
  // der am 1. des Monats gültig ist (HV-Office-Konvention, keine Tages-Proration).
  function getCostAnnualAmount(
    cost: any,
    periodFrom: string,
    periodTo: string,
    assignment?: any,
  ) {
    const pStart = parseLocalDate(periodFrom)!;
    const pEnd   = parseLocalDate(periodTo)!;
    const cStart = parseLocalDate(cost.valid_from);
    const cEnd   = parseLocalDate(cost.valid_to);
    const aStart = assignment ? parseLocalDate(assignment.valid_from) : null;
    const aEnd   = assignment ? parseLocalDate(assignment.valid_to)   : null;
    const monthlyEquiv = monthlyEquivOfCost(cost);
    let total = 0;
    const cursor = new Date(pStart.getFullYear(), pStart.getMonth(), 1);
    const last   = new Date(pEnd.getFullYear(),   pEnd.getMonth(),   1);
    while (cursor <= last) {
      const validAssignment = (!aStart || cursor >= aStart) && (!aEnd || cursor <= aEnd);
      const validCost       = (!cStart || cursor >= cStart) && (!cEnd || cursor <= cEnd);
      if (validAssignment && validCost) total += monthlyEquiv;
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return total;
  }

  // Vorschussverpflichtung — neue Logik (siehe Plan):
  //   sollHausgeldGesamt = Σ Hausgeld/Nebenkosten aus Stammdaten (mit Zeitanteil)
  //   sollEHR            = Schlusssaldo Konto 1930 (Planmäßige IHR Wohnungen)
  //   sollKostendeckung  = sollHausgeldGesamt − sollEHR
  //   ueberzahlung       = Σ Schlusssaldo Personenkonten (00xx Hausgeld …)
  //                        − sollKostendeckung − sollEHR
  // Effektiver Zeitraum = Schnittmenge aus Abrechnungszeitraum, Assignment-
  // Validity UND Cost-Validity. Vermeidet Doppel-Proration.
  let sollHausgeldGesamt = 0;
  assignments.forEach((a: any) => {
    const costs = a.contact_building_costs || [];
    costs.forEach((c: any) => {
      const ct = (c.cost_type || "").toLowerCase();
      if (!["hausgeld", "nebenkosten", "ruecklage"].includes(ct)) return;
      if (period) {
        sollHausgeldGesamt += getCostAnnualAmount(c, period.period_from, period.period_to, a);
      } else {
        sollHausgeldGesamt += monthlyEquivOfCost(c) * 12;
      }
    });
  });

  // Konto 1930 (EHR-Soll) — Schlusssaldo
  const ehrAccount = accounts.find((a: any) => a.account_number === "1930");
  const ehrAccountClosing = ehrAccount
    ? Math.abs(getEffectiveClosingBalance(ehrAccount.id, bookings as any[], flatBalances, fiscalYear, opening4000Id).amount)
    : 0;

  // Personenkonten (Hausgeld 00xx) — Σ Schlusssaldo
  const personenkontenAccounts = accounts.filter((a: any) =>
    typeof a.account_number === "string" &&
    /^00\d{2}$/.test(a.account_number) &&
    typeof a.account_name === "string" &&
    a.account_name.startsWith("Hausgeld "),
  );
  // Bank-zentrisch: Zahlungseingänge auf Personenkonten erscheinen als negativer
  // Saldo. Für die Überzahlung verwenden wir nur die BEWEGUNGEN des aktuellen
  // Geschäftsjahres (ohne Eröffnungsbestand), damit Vorjahres-Salden nicht
  // fälschlich als Überzahlung erscheinen.
  // signedTotalForAccount ist booking_type-aware: Eine income-Buchung auf der
  // Gegenkonto-Seite (Personenkonto) ergibt -amount, eine expense-Rückzahlung
  // ergibt korrekt +amount. So werden Doppelzahlungen + Rückzahlungen sauber
  // gegengerechnet (sumForAccount würde beides als -amount werten).
  const personenkontenSigned = personenkontenAccounts.reduce(
    (s: number, a: any) => s + signedTotalForAccount(a.id, bookings as any),
    0,
  );
  const personenkontenPaid = -personenkontenSigned;

  // EHR-Soll = gesamte planmäßige Rücklagenzuführung (ALLE Konten 193x, nicht nur
  // 1930), damit die Einnahmen-Position "Vorschüsse auf Erhaltungsrücklage" exakt
  // der Rücklagenzuführung entspricht (Gesamt- UND Einzelabrechnung nutzen dieselbe
  // Größe). Fallback: Schlusssaldo Konto 1930, dann Wirtschaftsplan.
  const totalSollEHR = totalReserve > 0.005
    ? totalReserve
    : (ehrAccountClosing > 0.005
        ? ehrAccountClosing
        : (Number(economicPlan?.total_reserve) || 0));
  const totalSollKostendeckung = Math.max(0, sollHausgeldGesamt - totalSollEHR);
  // Überzahlung = tatsächlich gezahlt − Soll-Hausgeld gesamt
  const totalUeberzahlung = personenkontenPaid - sollHausgeldGesamt;
  const hasReserveSplit = totalSollEHR > 0.005;
  const totalVorschuss = totalSollKostendeckung + totalSollEHR + Math.max(0, totalUeberzahlung);

  // Zinseinnahmen aus Buchungen (Konto 1840 — settlement_section='income')
  const incomeAccountTotals = (sectionAccounts["income"] || []).reduce(
    (acc: { interest: number; other: number }, a: any) => {
      const num = String(a.account_number || "");
      if (num.startsWith("1840") || num.startsWith("184")) acc.interest += a.totalAbs;
      else acc.other += a.totalAbs;
      return acc;
    },
    { interest: 0, other: 0 },
  );
  const totalIncomeFromBookings = incomeAccountTotals.interest + incomeAccountTotals.other;
  const totalEinnahmen = totalVorschuss + totalIncomeFromBookings;

  // Spitze: nur Soll-Vorschüsse (Kostendeckung + EHR) zählen, KEINE Überzahlung
  const vorschussFuerSpitze = totalSollKostendeckung + totalSollEHR;
  const abrechnungsspitze = vorschussFuerSpitze - abrechnungssumme;

  function getTimeProportion(assignment: any) {
    if (!period) return 1;
    const pStart = new Date(period.period_from).getTime();
    const pEnd = new Date(period.period_to).getTime();
    const totalDays = (pEnd - pStart) / (1000 * 60 * 60 * 24) + 1;
    const vFrom = assignment.valid_from ? new Date(assignment.valid_from).getTime() : pStart;
    const vTo = assignment.valid_to ? new Date(assignment.valid_to).getTime() : pEnd;
    const effStart = Math.max(pStart, vFrom);
    const effEnd = Math.min(pEnd, vTo);
    return Math.max(0, (effEnd - effStart) / (1000 * 60 * 60 * 24) + 1) / totalDays;
  }

  // --- Owner calculation ---
  const getShareTotal = (shareType: string) => {
    const mapped = getShareType(shareType);
    // For "einheit" (1 Einheit = 1 Anteil) use building unit count, override-aware.
    if (mapped === "einheit") {
      return building?.unit_count_for_billing ?? building?.unit_count ?? assignments.length;
    }
    return assignments.reduce((s, a: any) => {
      const share = (a.contact_building_shares || []).find((sh: any) => sh.share_type === mapped);
      return s + (share ? Number(share.share_value) : 0);
    }, 0);
  };

  const computeOwnerResult = (assignment: any) => {
    const contact = assignment.contacts;
    const name = contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unbekannt";
    const shares = assignment.contact_building_shares || [];
    const costs = assignment.contact_building_costs || [];
    const timeProp = getTimeProportion(assignment);

    // Per-account breakdown for Einzelabrechnung
    // displaySection: in welchem Block der Einzelabrechnung die Zeile erscheinen soll
    // signedFactor: Vorzeichen-Faktor für "Ihre Kosten" (+1 normal, -1 für Gegenbuchung Rücklagenentnahme)
    const accountBreakdown: Array<{
      accountNumber: string; accountName: string; distributableAmount: number;
      distKey: string; totalShares: number; ownerShare: number; ownerCost: number;
      settlement35aType: string | null;
      displaySection: string;
      signedFactor: number;
    }> = [];

    let totalOwnerCost = 0;
    let owner35aDienste = 0;
    let owner35aHandwerker = 0;

    // Distributable accounts
    // Inline-Toggle "Abrechnungsrelevant" respektieren: explizit false → ausblenden
    const distributableAccounts = accounts.filter(
      (a) =>
        (a.is_distributable || a.settlement_section === "reserve")
        && !isAccrualBalanceAccount(a)
        && (a as any).is_billing_relevant !== false
    );
    distributableAccounts.forEach((acc) => {
      // IHR-Zuführung (reserve section): gebuchte Rücklagenbildung bevorzugen,
      // WP-Wert nur als Fallback, wenn keine Buchung auf dem Rücklagenkonto vorliegt.
      const isReserveAcc = acc.settlement_section === "reserve";
      const bookedAbs = getAccountAbsTotal(acc.id);
      const planReserve = Number(economicPlan?.total_reserve) || 0;
      const total = isReserveAcc
        ? (bookedAbs > 0 ? bookedAbs : planReserve)
        : bookedAbs;
      if (total === 0) return;

      const distKey = getDistKey(acc.id, acc.default_distribution_key);
      const shareType = getShareType(distKey);

      // Heizkosten-Konten (z. B. 1400) — strikt Brunata-Werte, KEIN MEA-Fallback.
      // Fehlen Brunata-Werte, wird 0 verteilt (Warnung wird in der UI angezeigt).
      // Greift NUR wenn der effektive Verteiler-Schlüssel auch heizungsbezogen ist.
      // Ein MEA-/Einheit-/qm-Override hebt die Brunata-Logik auf.
      const isHeatingShareType = ["heizkosten", "wasser", "warmwasser"].includes(shareType);
      const isHeatingAccount = acc.is_heating_relevant === true && isHeatingShareType;
      // Special handling for "einheit" share — total = building unit count, owner share = 1
      const isUnitsKey = shareType === "einheit";
      let ownerCost = 0;
      let ownerShareValue = 0;
      let totalSharesValue = 0;

      if (isHeatingAccount) {
        const hdv = heatingDistValues.find((h: any) => h.assignment_id === assignment.id);
        ownerCost = hdv ? Number(hdv.amount) : 0;
        ownerShareValue = ownerCost;
        totalSharesValue = total;
      } else if (isUnitsKey) {
        // "einheit"-Schluessel: den tatsaechlich gepflegten einheit-Anteil verwenden,
        // NICHT pauschal 1 pro Einheit. Einheiten ohne einheit-Anteil (z. B. Stellplaetze/
        // Garagen) tragen dadurch korrekt 0. Fallback fuer Objekte ohne gepflegte
        // einheit-Anteile: nur Wohn-/Gewerbeeinheiten zaehlen.
        const isMainUnit = (a: any) =>
          a?.unit_kind == null || a.unit_kind === "apartment" || a.unit_kind === "commercial";
        const einheitSum = assignments.reduce((s: number, a: any) =>
          s + Number((a.contact_building_shares || []).find((sh: any) => sh.share_type === "einheit")?.share_value || 0), 0);
        if (einheitSum > 0) {
          const ownEinheit = Number((shares.find((s: any) => s.share_type === "einheit")?.share_value) || 0);
          totalSharesValue = building?.unit_count_for_billing ?? einheitSum;
          ownerShareValue = ownEinheit;
          ownerCost = totalSharesValue > 0 ? total * (ownerShareValue / totalSharesValue) * timeProp : 0;
        } else {
          const eligibleCount = assignments.filter(isMainUnit).length;
          const totalUnits = building?.unit_count_for_billing ?? eligibleCount;
          totalSharesValue = totalUnits;
          ownerShareValue = isMainUnit(assignment) ? 1 : 0;
          ownerCost = (ownerShareValue && totalUnits > 0) ? (total / totalUnits) * timeProp : 0;
        }
      } else {
        const ownerShare = shares.find((s: any) => s.share_type === shareType);
        totalSharesValue = getShareTotal(distKey);
        ownerShareValue = ownerShare ? Number(ownerShare.share_value) : 0;
        ownerCost = totalSharesValue > 0 ? total * (ownerShareValue / totalSharesValue) * timeProp : 0;
      }

      totalOwnerCost += ownerCost;

      // §35a tracking
      if (acc.settlement_35a_type === "dienste") owner35aDienste += ownerCost;
      if (acc.settlement_35a_type === "handwerker") owner35aHandwerker += ownerCost;

      accountBreakdown.push({
        accountNumber: acc.account_number,
        accountName: acc.account_name,
        distributableAmount: total,
        distKey: SHARE_LABELS[distKey] || distKey,
        totalShares: totalSharesValue,
        ownerShare: ownerShareValue,
        ownerCost,
        settlement35aType: acc.settlement_35a_type,
        displaySection: acc.settlement_section,
        signedFactor: 1,
      });

      // GENERISCHE RÜCKLAGEN-DOPPELDARSTELLUNG (HV-Office-konform)
      // Konten mit reserve_role='withdrawal' (z. B. 1920 "Rep. aus Entnahme RL")
      // erscheinen ZUSÄTZLICH im Rücklagen-Block mit umgekehrtem Vorzeichen
      // (= Gegenbuchung "aus Rücklage finanziert" — neutralisiert die Belastung
      //   des Eigentümers, da die Reparatur ja aus angesparten Mitteln bezahlt wurde).
      if (isReserveWithdrawalAccount(acc) && ownerCost !== 0) {
        accountBreakdown.push({
          accountNumber: acc.account_number,
          accountName: acc.account_name,
          distributableAmount: total,
          distKey: SHARE_LABELS[distKey] || distKey,
          totalShares: totalSharesValue,
          ownerShare: ownerShareValue,
          ownerCost: -ownerCost, // Gegenbuchung
          settlement35aType: null,
          displaySection: "reserve",
          signedFactor: -1,
        });
        // Netto-Effekt auf totalOwnerCost = 0 (Aufwand + Gegenbuchung heben sich auf)
        totalOwnerCost -= ownerCost;
      }
    });

    // Vorschussverpflichtung — SOLL or IST
    let hausgeld = 0;
    let reserve = 0;

    if (useIstVorschuss) {
      // IST: sum actual payments from person account bookings
      // Find person account for this contact
      const personAccount = accounts.find(a => a.account_number.startsWith("0000") && a.building_id === buildingId && a.account_name?.toLowerCase().includes(name.toLowerCase().split(" ")[0]));
      const contactPersonAccounts = accounts.filter(a => a.account_number.startsWith("0000") && a.building_id === buildingId);
      // Match by unit number in account name or number
      const matchedAccount = contactPersonAccounts.find(a => 
        a.account_number === assignment.unit_number?.padStart(5, "0") || 
        a.account_name?.includes(assignment.unit_number || "___")
      ) || personAccount;
      
      if (matchedAccount) {
        const accountPayments = istPayments.filter((p: any) => p.account_id === matchedAccount.id);
        const totalIst = accountPayments.reduce((s: number, p: any) => s + Math.abs(Number(p.amount)), 0);
        hausgeld = totalIst; // IST includes everything
      } else {
        // Fallback to SOLL — assignment + cost validity, Stichtag = 1. des Monats.
        hausgeld = costs
          .filter((c: any) => ["hausgeld", "nebenkosten"].includes((c.cost_type || "").toLowerCase()))
          .reduce((s: number, c: any) => period
            ? s + getCostAnnualAmount(c, period.period_from, period.period_to, assignment)
            : s + monthlyEquivOfCost(c) * 12, 0);
        reserve = costs
          .filter((c: any) => (c.cost_type || "").toLowerCase() === "ruecklage")
          .reduce((s: number, c: any) => period
            ? s + getCostAnnualAmount(c, period.period_from, period.period_to, assignment)
            : s + monthlyEquivOfCost(c) * 12, 0);
      }
    } else {
      // SOLL: from contact_building_costs (Stichtag = 1. des Monats, keine Doppel-Proration).
      hausgeld = costs
        .filter((c: any) => ["hausgeld", "nebenkosten"].includes((c.cost_type || "").toLowerCase()))
        .reduce((s: number, c: any) => period
          ? s + getCostAnnualAmount(c, period.period_from, period.period_to, assignment)
          : s + monthlyEquivOfCost(c) * 12, 0);
      reserve = costs
        .filter((c: any) => (c.cost_type || "").toLowerCase() === "ruecklage")
        .reduce((s: number, c: any) => period
          ? s + getCostAnnualAmount(c, period.period_from, period.period_to, assignment)
          : s + monthlyEquivOfCost(c) * 12, 0);
    }

    const totalPaid = hausgeld + reserve;

    // Persönliche IST-Zahlung dieses Eigentümers (GJ-only, ohne Eröffnungsbestand)
    // wird IMMER ermittelt — unabhängig vom SOLL/IST-Toggle — damit eine private
    // Überbezahlung im Ihr-Anteil-Saldo verrechnet werden kann.
    const unitRaw = String(assignment.unit_number || "").trim();
    const unitDigits = unitRaw.replace(/^0+/, "");
    const normTok = (s?: string) => (s || "").toLowerCase().replace(/[^a-zäöüß0-9 ]/g, " ").trim();
    const contactTokens = [
      contact?.last_name,
      (contact as any)?.short_name,
      contact?.company_name,
      contact?.first_name,
    ]
      .filter(Boolean)
      .flatMap((s) => normTok(s as string).split(/\s+/))
      .filter((t) => t && t.length >= 3);
    // Personenkonto strikt ueber die Einheitennummer zuordnen (Einheit 0018 -> Konto 0018).
    // Der Namensabgleich ist NUR Fallback fuer Objekte ohne nummerierte Personenkonten —
    // sonst trifft er bei Eigentuemern mit mehreren Einheiten das falsche (erste) Konto
    // und zieht dessen Zahlungen faelschlich als Ueberzahlung heran.
    const personAccByUnit = unitDigits
      ? personenkontenAccounts.find((a: any) =>
          String(a.account_number || "").trim().replace(/^0+/, "") === unitDigits)
      : undefined;
    const personAcc = personAccByUnit
      ?? personenkontenAccounts.find((a: any) =>
          contactTokens.some((tok) => normTok(a.account_name).includes(tok)));
    const ownerActualPaid = personAcc
      ? -signedTotalForAccount(personAcc.id, bookings as any)
      : totalPaid;
    const ownerSollVorschuss = totalPaid;
    const ownerUeberzahlung = Math.max(0, ownerActualPaid - ownerSollVorschuss);
    const ownerSpitze = ownerSollVorschuss - totalOwnerCost;
    // Persönliche Überzahlung wird im Ihr-Anteil-Saldo verrechnet
    const result = ownerSpitze + ownerUeberzahlung;

    return {
      assignmentId: assignment.id,
      contactId: contact?.id,
      name,
      unitNumber: assignment.unit_number || "–",
      totalOwnerCost,
      hausgeld,
      reserve,
      totalPaid,
      actualPaid: ownerActualPaid,
      ownerUeberzahlung,
      result,
      timeProp,
      owner35aDienste,
      owner35aHandwerker,
      accountBreakdown,
    };

  };

  const ownerResults = assignments.map(computeOwnerResult);

  const totalPaidAll = ownerResults.reduce((s, o) => s + o.totalPaid, 0);
  const totalShareAll = ownerResults.reduce((s, o) => s + o.totalOwnerCost, 0);

  // ---- aus BillingSettlement.tsx: Verteilerschlüssel-Warnungen ----
  const distributionWarnings: DistWarning[] = (() => {
    const warnings: DistWarning[] = [];
    const distributableAccounts = accounts.filter(
      (a: any) =>
        a.is_distributable &&
        !isAccrualBalanceAccount(a) &&
        !isHeatingPrepayAccount(a) &&
        // Personenkonten (Debitoren, Kontonr. beginnt mit "0") überspringen — sie haben
        // konzeptionell keinen Verteilerschlüssel, sondern sind das Soll-/Ist-Ziel der Verteilung.
        !String(a.account_number || "").startsWith("0"),
    );

    for (const acc of distributableAccounts) {
      const isReserveAcc = acc.settlement_section === "reserve";
      const bookedSigned = getAccountBookingTotal(acc.id);
      const planReserve = Number(economicPlan?.total_reserve) || 0;
      const total = isReserveAcc
        ? (Math.abs(bookedSigned) > 0 ? bookedSigned : planReserve)
        : bookedSigned;
      const absTotal = Math.abs(total);
      if (absTotal < 0.005) continue;

      const distKey = getDistKey(acc.id, acc.default_distribution_key);
      // Generisch: jedes Konto, das als heizungsrelevant markiert ist UND in der Heizkosten-Section liegt,
      // muss strikt nach Brunata verteilt werden — kein MEA-Fallback.
      const isHeating1400 = acc.is_heating_relevant === true && (acc.settlement_section === "heating" || acc.account_number === "1400");

      let reason: string | null = null;

      if (!acc.default_distribution_key && !overrides.find((o: any) => o.account_id === acc.id)) {
        reason = "Kein Verteilerschlüssel hinterlegt";
      } else if (isHeating1400 && heatingDistValues.length === 0) {
        reason = "Verteilerschlüssel 'heizkostenverordnung', aber keine Brunata-Werte für diese Periode";
      } else {
        const shareType = getShareType(distKey);
        if (shareType === "einheit") {
          const totalUnits = building?.unit_count_for_billing ?? building?.unit_count ?? assignments.length;
          if (!totalUnits) reason = "Verteilerschlüssel 'einheiten', aber keine Einheitenzahl gepflegt";
        } else if (shareType === "heizkosten") {
          if (heatingDistValues.length === 0) {
            reason = "Verteilerschlüssel 'heizkostenverordnung', aber keine Brunata-Werte für diese Periode";
          }
        } else if (shareType === "direkt") {
          // Direktzuordnung: keine Anteils-Summe nötig
        } else {
          const totalShares = assignments.reduce((s: number, a: any) => {
            const share = (a.contact_building_shares || []).find((sh: any) =>
              String(sh.share_type || "").toLowerCase() === String(shareType).toLowerCase()
            );
            return s + (share ? Number(share.share_value) || 0 : 0);
          }, 0);
          if (totalShares <= 0) {
            reason = `Verteilerschlüssel '${distKey}', aber keine ${SHARE_LABELS[shareType] || shareType}-Anteile gepflegt`;
          }
        }
      }

      if (reason) {
        warnings.push({
          accountNumber: acc.account_number,
          accountName: acc.account_name,
          amount: absTotal,
          distributionKey: distKey,
          reason,
        });
      }
    }
    return warnings;
  })();

  // ---- aus BillingSettlement.tsx: buildPayloadInputs ----
  const buildPayloadInputs = (): BillingPayloadInputs => ({
    building, period, fiscalYear,
    sectionAccounts: Object.fromEntries(
      Object.entries(sectionAccounts).map(([k, accs]) => [
        k,
        (accs as any[]).map((a) => ({ ...a, distKeyLabel: SHARE_LABELS[a.distKey] || a.distKey })),
      ]),
    ),
    totals: {
      totalIncome, totalOperatingDist, totalOperatingNonDist, totalAccrual,
      totalReserve, totalReserveWithdrawal, abrechnungssumme, totalVorschuss, abrechnungsspitze,
      totalSollKostendeckung, totalSollEHR, totalUeberzahlung, totalEinnahmen,
      incomeInterest: incomeAccountTotals.interest, incomeOther: incomeAccountTotals.other,
      openingGiro, openingReserve, openingFuel, openingPrepay, openingOther, openingTotal,
      closingGiro, closingReserve, closingFuel, closingPrepay, closingOther, closingTotal,
    },
    ownerResults,
    assignmentsById: Object.fromEntries(assignments.map((a: any) => [a.id, a])),
    carryAccountsList,
  });

  return {
    // gefilterte Buchungen (Defense-in-depth)
    bookings,
    // Helfer (für UI-Zwecke, z. B. Warnungen/Anzeige)
    getDistKey,
    getAccountBookingTotal,
    getAccountAbsTotal,
    getWpAmount,
    isAccrualBalanceAccount,
    isHeatingPrepayAccount,
    isReserveWithdrawalAccount,
    // Sektionen + Summen
    sectionAccounts,
    totalIncome,
    totalOperatingDist,
    totalOperatingNonDist,
    totalAccrual,
    reserveFromBookings,
    planReserveTotal,
    totalReserve,
    reserveFundedAccounts,
    totalReserveWithdrawal,
    // Bestände
    opening4000Id,
    carryAccounts,
    flatBalances,
    openingByAccount,
    closingByAccount,
    openingGiro,
    openingReserve,
    openingFuel,
    openingPrepay,
    openingOther,
    openingTotal,
    closingGiro,
    closingReserve,
    closingFuel,
    closingPrepay,
    closingOther,
    closingTotal,
    carryAccountsList,
    reserveAccountsList,
    // Abrechnungssumme
    totalDistributable,
    totalOperatingDistRelevant,
    totalOperatingNonDistRelevant,
    totalHeatingRelevant,
    totalReserveRelevant,
    totalAccrualRelevant,
    abrechnungssumme,
    // Vorschüsse / Einnahmen
    sollHausgeldGesamt,
    ehrAccountClosing,
    personenkontenAccounts,
    personenkontenSigned,
    personenkontenPaid,
    totalSollEHR,
    totalSollKostendeckung,
    totalUeberzahlung,
    hasReserveSplit,
    totalVorschuss,
    incomeAccountTotals,
    totalIncomeFromBookings,
    totalEinnahmen,
    vorschussFuerSpitze,
    abrechnungsspitze,
    // Eigentümer
    computeOwnerResult,
    ownerResults,
    totalPaidAll,
    totalShareAll,
    // Warnungen
    distributionWarnings,
    // Payload-Eingaben (exakt wie buildPayloadInputs() in der UI)
    buildPayloadInputs,
  };
}

// ============================================================
//  distribution_only-Merge (aus der owner-assignments-Query der UI)
// ============================================================

/**
 * WICHTIG: Nebeneinheiten (Stellplätze, Keller, …) mit billing_mode='distribution_only'
 * bekommen KEINE eigene Abrechnungszeile. Ihre Shares (MEA, Einheit, qm, …) werden
 * unmittelbar nach dem Laden auf die Hauptwohnung des selben Eigentümers im Building
 * addiert, damit die bestehende Verteilungs-Logik unverändert greift.
 */
export function mergeDistributionOnlyShares(data: any[] | null | undefined): any[] {
  const all = (data || []) as any[];

  // Nur der billing_mode entscheidet ueber eine eigene Abrechnung — NICHT die
  // unit_kind. Stellplaetze/Keller mit billing_mode='own_billing' erhalten daher
  // eine eigene Einzelabrechnung; nur 'distribution_only' wird zur Hauptwohnung gefaltet.
  const isSecondary = (a: any) =>
    a?.billing_mode === "distribution_only";

  // Map contact_id -> Summe-Map(share_type -> value) aus Sub-Units
  const subSharesByContact = new Map<string, Map<string, number>>();
  for (const a of all) {
    if (!isSecondary(a) || !a.contact_id) continue;
    const m = subSharesByContact.get(a.contact_id) || new Map<string, number>();
    for (const s of (a.contact_building_shares || [])) {
      m.set(s.share_type, (m.get(s.share_type) || 0) + Number(s.share_value || 0));
    }
    subSharesByContact.set(a.contact_id, m);
  }

  // Hauptwohnungen behalten + Shares aufaddieren
  const mains = all.filter((a) => !isSecondary(a)).map((a) => {
    const extra = a.contact_id ? subSharesByContact.get(a.contact_id) : null;
    if (!extra || extra.size === 0) return a;
    const sharesByType = new Map<string, any>();
    for (const s of (a.contact_building_shares || [])) sharesByType.set(s.share_type, { ...s });
    for (const [type, val] of extra.entries()) {
      if (sharesByType.has(type)) {
        const cur = sharesByType.get(type);
        sharesByType.set(type, { ...cur, share_value: Number(cur.share_value || 0) + val });
      } else {
        sharesByType.set(type, { share_type: type, share_value: val });
      }
    }
    return { ...a, contact_building_shares: Array.from(sharesByType.values()) };
  });
  return mains;
}

// ============================================================
//  Vorlagen-Auswahl (identisch zur UI)
// ============================================================

export function waehleAbrechnungsVorlagen(billingTemplates: any[]) {
  const singleTemplates = billingTemplates.filter((t: any) => t.scope === "single");
  const overallTemplates = billingTemplates.filter((t: any) => t.scope === "overall");
  const assetReportTemplates = billingTemplates.filter((t: any) => t.scope === "asset_report");
  const paragraph35aTemplates = billingTemplates.filter((t: any) => t.scope === "paragraph_35a");
  const effectiveSingleTpl = singleTemplates[0]?.id || null;
  const effectiveOverallTpl = overallTemplates[0]?.id || effectiveSingleTpl;
  const effectiveAssetReportTpl = assetReportTemplates[0]?.id || null;
  const effectiveParagraph35aTpl = paragraph35aTemplates[0]?.id || null;
  return {
    singleTemplates,
    overallTemplates,
    assetReportTemplates,
    paragraph35aTemplates,
    effectiveSingleTpl,
    effectiveOverallTpl,
    effectiveAssetReportTpl,
    effectiveParagraph35aTpl,
  };
}

// ============================================================
//  Server-Loader — dieselben Abfragen wie die react-query Hooks der UI
// ============================================================

export interface AbrechnungsDaten extends AbrechnungsRohdaten {
  /** billing_templates (alle, created_at absteigend) — für Vorlagen-Auswahl */
  billingTemplates: any[];
}

/**
 * Lädt alle Rohdaten exakt wie BillingSettlement.tsx.
 * `db` ist ein supabase-js Client (Service-Role oder User-JWT).
 * `fiscal_year` optional — die UI bekommt es als Prop `period.fiscal_year`
 * (siehe BillingTab.tsx), daher Default = period.fiscal_year.
 * Buchungen werden seitenweise vollständig geladen (_shared/finanzen/abfragen.ts).
 */
export async function ladeAbrechnungsDaten(
  db: any,
  opts: { building_id: string; period_id: string; useIstVorschuss: boolean; fiscal_year?: number },
): Promise<AbrechnungsDaten> {
  const buildingId = opts.building_id;
  const periodId = opts.period_id;

  // Period
  const period = await (async () => {
    const { data, error } = await db.from("billing_periods").select("*").eq("id", periodId).single();
    if (error) throw error;
    return data;
  })();
  const fiscalYear: number = opts.fiscal_year ?? period.fiscal_year;

  // ALL accounts (not just billing-relevant — we need section-based filtering)
  const accountsP = (async () => {
    const { data, error } = await db
      .from("chart_of_accounts")
      .select("*")
      .or(`building_id.is.null,building_id.eq.${buildingId}`)
      .order("account_number");
    if (error) throw error;
    return data;
  })();

  // Account overrides
  const overridesP = (async () => {
    const { data, error } = await db.from("building_account_overrides").select("*").eq("building_id", buildingId);
    if (error) throw error;
    return data;
  })();

  // All bookings in the period — per booking_date (UI: enabled: !!period)
  const rawBookingsP = ladeBuchungenZeitraum(db, buildingId, period!.period_from, period!.period_to);

  // Owners with shares and costs (+ distribution_only-Merge)
  const assignmentsP = (async () => {
    const { data, error } = await db
      .from("contact_building_assignments")
      .select(`*, contacts(id, first_name, last_name, company_name), contact_building_shares(*), contact_building_costs(*)`)
      .eq("building_id", buildingId)
      .eq("is_active", true)
      .in("role_in_building", ["eigentuemer", "mieter"]);
    if (error) throw error;
    return mergeDistributionOnlyShares(data);
  })();

  // Building
  const buildingP = (async () => {
    const { data, error } = await db
      .from("buildings")
      .select("name, address, building_code, unit_count, unit_count_for_billing")
      .eq("id", buildingId)
      .single();
    if (error) throw error;
    return data;
  })();

  // Economic plan (for IHR contribution as planned reserve)
  const economicPlanP = (async () => {
    const { data, error } = await db
      .from("economic_plans")
      .select("total_reserve")
      .eq("building_id", buildingId)
      .eq("fiscal_year", fiscalYear)
      .maybeSingle();
    if (error) return null;
    return data as any;
  })();

  // Account balances
  const balancesP = (async () => {
    const { data, error } = await db
      .from("account_balances")
      .select("*, chart_of_accounts(account_number, account_name, category, carry_forward_balance)")
      .eq("building_id", buildingId)
      .eq("fiscal_year", fiscalYear);
    if (error) throw error;
    return data;
  })();

  // Plan-Werte für die Spalte „Wirtschaftsplan" (gleiche Abfrage wie die App)
  const wpItems: any[] = await ladeWirtschaftsplanPositionen(db, buildingId, fiscalYear);

  // Heating distribution values
  const heatingDistValuesP = (async () => {
    const { data, error } = await db
      .from("heating_distribution_values")
      .select("*")
      .eq("building_id", buildingId)
      .eq("billing_period_id", periodId);
    if (error) return [];
    return data || [];
  })();

  // Open invoices
  const openInvoicesP = (async () => {
    const { data, error } = await db
      .from("invoices")
      .select("id, vendor_name, gross_amount, invoice_date, status")
      .eq("building_id", buildingId)
      .in("status", ["pending", "approved"])
      .order("invoice_date");
    if (error) return [];
    return (data as any[]) || [];
  })();

  // Billing templates (für Vorlagen-Auswahl)
  const billingTemplatesP = (async () => {
    const { data, error } = await db.from("billing_templates").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  })();

  const [accountsRaw, overridesRaw, rawBookingsRaw, assignments, building, economicPlan, balancesRaw, heatingDistValues, openInvoices, billingTemplates] =
    await Promise.all([accountsP, overridesP, rawBookingsP, assignmentsP, buildingP, economicPlanP, balancesP, heatingDistValuesP, openInvoicesP, billingTemplatesP]);
  // UI-Defaults: `data: x = []`
  const accounts: any[] = accountsRaw ?? [];
  const overrides: any[] = overridesRaw ?? [];
  const rawBookings: any[] = rawBookingsRaw ?? [];
  const balances: any[] = balancesRaw ?? [];

  // IST-payments on person accounts (for SOLL/IST toggle) — UI: enabled: useIstVorschuss
  let istPayments: any[] = [];
  if (opts.useIstVorschuss) {
    istPayments = await (async () => {
      // Get person accounts (account_number starts with 0000)
      const personAccounts = accounts.filter(a => a.account_number.startsWith("0000"));
      if (personAccounts.length === 0) return [];
      return ladeIstZahlungen(db, buildingId, fiscalYear, personAccounts.map(a => a.id));
    })() ?? [];
  }

  return {
    buildingId,
    periodId,
    fiscalYear,
    period,
    accounts,
    overrides,
    rawBookings,
    istPayments,
    assignments,
    building,
    economicPlan,
    balances,
    wpItems,
    heatingDistValues,
    openInvoices,
    billingTemplates,
  };
}

// ============================================================
//  Payloads für generate-billing-document (wie downloadBilling, DMS-Modus)
// ============================================================

export interface AbrechnungsDokument {
  /** generate-billing-document items[0] */
  item: { kind: "overall" | "owner" | "asset_report"; ownerId?: string; ownerName?: string; unitNumber?: string; payload: any };
  /** file_prefix wie im DMS-Modus der UI */
  filePrefix: string;
  /** DMS-Ablage (Anzeigename, Ordner, Sichtbarkeit) wie DmsJobsProvider */
  dms: DmsAblageInfo;
}

export interface AbrechnungsPayloads {
  overall: any;
  owners: Array<{
    assignmentId: string;
    /** assignment.contact_id (wie DMS-Job contactId in der UI) */
    contactId: string | null;
    ownerName: string;
    /** a.unit_number als String oder "" (wie DMS-Modus der UI) */
    unitNumber: string;
    payload: any;
    dokument: AbrechnungsDokument;
  }>;
  assetReport?: any;
  dokumente: {
    overall: AbrechnungsDokument;
    assetReport?: AbrechnungsDokument;
  };
}

/**
 * Erzeugt die Payloads exakt wie BillingSettlement.downloadBilling() im DMS-Modus
 * (Gesamtabrechnung / Einzelabrechnungen aller Eigentümer / Vermögensbericht).
 * `erstellDatum` (ISO, z. B. "2026-11-01") setzt {erstell_datum} fest; ohne Angabe
 * wie in der UI "jetzt".
 */
export function erzeugeAbrechnungsPayloads(
  daten: AbrechnungsRohdaten,
  ergebnis: AbrechnungsErgebnis,
  optionen: { erstellDatum?: string; mitVermoegensbericht?: boolean } = {},
): AbrechnungsPayloads {
  const fiscalYear = daten.fiscalYear;
  const inp: BillingPayloadInputs = {
    ...ergebnis.buildPayloadInputs(),
    ...(optionen.erstellDatum ? { erstellDatum: optionen.erstellDatum } : {}),
  };

  const overallPayload = buildOverallPayload(inp);
  const overallDms = dmsAblageGesamtabrechnung(fiscalYear);
  const overall: AbrechnungsDokument = {
    item: { kind: "overall", payload: overallPayload },
    filePrefix: overallDms.filePrefix,
    dms: overallDms,
  };

  const owners = ergebnis.ownerResults.map((o) => {
    const a = (daten.assignments as any[]).find((x) => x.id === o.assignmentId);
    const unitNo = a?.unit_number ? String(a.unit_number) : "";
    const payload = buildOwnerPayload(inp, o.assignmentId);
    const dms = dmsAblageEinzelabrechnung(fiscalYear, o.name, unitNo);
    return {
      assignmentId: o.assignmentId,
      contactId: a?.contact_id || null,
      ownerName: o.name,
      unitNumber: unitNo,
      payload,
      dokument: {
        item: { kind: "owner" as const, ownerId: o.assignmentId, ownerName: o.name, unitNumber: unitNo, payload },
        filePrefix: dms.filePrefix,
        dms,
      },
    };
  });

  let assetReport: any = undefined;
  let assetReportDok: AbrechnungsDokument | undefined = undefined;
  if (optionen.mitVermoegensbericht !== false) {
    assetReport = buildAssetReportPayload(inp);
    const dms = dmsAblageVermoegensbericht(fiscalYear);
    assetReportDok = {
      item: { kind: "asset_report", payload: assetReport },
      filePrefix: dms.filePrefix,
      dms,
    };
  }

  return {
    overall: overallPayload,
    owners,
    assetReport,
    dokumente: { overall, assetReport: assetReportDok },
  };
}

/**
 * Request-Body für generate-billing-document — identisch zum DMS-Modus der UI.
 * templateId: overall → effectiveOverallTpl, owner → effectiveSingleTpl,
 * asset_report → effectiveAssetReportTpl (siehe waehleAbrechnungsVorlagen).
 */
export function baueAbrechnungsDokumentBody(args: {
  templateId: string | null;
  overallTemplateId: string | null;
  fiscalYear: number;
  dokument: AbrechnungsDokument;
  format?: "pdf" | "docx";
}) {
  return {
    template_id: args.templateId, overall_template_id: args.overallTemplateId,
    fiscal_year: args.fiscalYear, mode: "single", format: args.format ?? "pdf",
    file_prefix: args.dokument.filePrefix,
    items: [args.dokument.item],
  };
}

// Re-Export für Server-Aufrufer (Dateinamen-Präfix wie in der UI)
export { unitFilePrefix };
