// ============================================================
// Billing-Payload-Builder
// ------------------------------------------------------------
// Wandelt die GENAU SELBEN, in BillingSettlement.tsx berechneten
// Werte (ownerResults, sectionAccounts, totals, building, period)
// in ein flaches JSON für docxtemplater um.
//
// PFLICHT-PRINZIP: Diese Datei darf NICHTS neu rechnen, sondern
// reicht ausschließlich vorberechnete UI-Werte durch und formatiert
// sie. Damit ist garantiert, dass UI und generiertes Dokument
// niemals voneinander abweichen.
// ============================================================

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const fmtNum = (n: number, digits = 3) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(Number(n) || 0);
const fmtDateDe = (s: string | null | undefined) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("de-DE");
};

// Übergabe-Typen — bewusst lose, damit jede Erweiterung in
// BillingSettlement.tsx ohne Bruch durchgereicht werden kann.
export interface BillingPayloadInputs {
  building: any;
  period: any;
  fiscalYear: number;
  // UI-Section-Map: { sectionKey: [{ account_number, account_name, total, totalAbs, wpAmount, distKey, ... }] }
  sectionAccounts: Record<string, any[]>;
  // UI-Aggregate
  totals: {
    totalIncome: number;
    totalOperatingDist: number;
    totalOperatingNonDist: number;
    totalAccrual: number;
    totalReserve: number;
    totalReserveWithdrawal: number;
    abrechnungssumme: number;
    totalVorschuss: number;
    abrechnungsspitze: number;
    totalSollKostendeckung: number;
    totalSollEHR: number;
    totalUeberzahlung: number;
    totalEinnahmen: number;
    incomeInterest: number;
    incomeOther: number;
    openingGiro: number;
    openingReserve: number;
    openingFuel: number;
    openingPrepay: number;
    openingOther: number;
    openingTotal: number;
    closingGiro: number;
    closingReserve: number;
    closingFuel: number;
    closingPrepay: number;
    closingOther: number;
    closingTotal: number;
  };
  ownerResults: Array<{
    assignmentId: string;
    contactId?: string;
    name: string;
    unitNumber: string;
    totalOwnerCost: number;
    hausgeld: number;
    reserve: number;
    totalPaid: number;
    result: number;
    timeProp: number;
    owner35aDienste: number;
    owner35aHandwerker: number;
    accountBreakdown: Array<{
      accountNumber: string;
      accountName: string;
      distributableAmount: number;
      distKey: string;
      totalShares: number;
      ownerShare: number;
      ownerCost: number;
      settlement35aType: string | null;
      displaySection: string;
      signedFactor: number;
    }>;
  }>;
  // Optional: Per-Konto Liste der Bestandskonten (Bank, Rücklage, Brennstoff, Vorauszahlungen, Sonstige)
  carryAccountsList?: Array<{
    account_number: string;
    account_name: string;
    opening: number;
    closing: number;
    category: "bank" | "reserve" | "fuel" | "prepay" | "other";
  }>;
  // Optional: Eigentümer-Stammdaten (aus contact_building_assignments) — adresse, anrede etc.
  assignmentsById?: Record<string, any>;
}

const SECTION_LABELS: Record<string, string> = {
  income: "Einnahmen",
  operating_distributable: "Umlagefähige Bewirtschaftungskosten",
  operating_non_distributable: "Nicht umlagefähige Kosten",
  heating: "Heizkosten (nach Brunata)",
  reserve: "Instandhaltungsrücklage",
  reserve_withdrawal: "Entnahme aus Rücklage",
  accrual: "Abgrenzungen (nachrichtlich)",
};

import { getAccrualDisplaySign } from "./accrualSign";

function sectionListFromUi(accs: any[] = [], opts: { asExpense?: boolean; asAccrual?: boolean } = {}) {
  return accs.map((a) => {
    const abs = Math.abs(a.totalAbs || 0);
    let signed: number;
    if (opts.asAccrual) {
      signed = abs * getAccrualDisplaySign(a.account_number);
    } else if (opts.asExpense) {
      signed = -abs;
    } else {
      signed = a.total;
    }
    const wp = Math.abs(a.wpAmount || 0);
    const wpSigned = opts.asAccrual ? wp * getAccrualDisplaySign(a.account_number) : (opts.asExpense ? -wp : a.wpAmount);
    return {
      konto_nr: a.account_number,
      konto_name: a.account_name,
      verteiler: a.distKeyLabel || a.distKey || "",
      betrag: fmtEUR(signed),
      betrag_abs: fmtEUR(abs),
      betrag_ist: fmtEUR(signed),
      betrag_verteilbar: fmtEUR(opts.asExpense ? -(a.distributableAmount ?? abs) : (a.distributableAmount ?? abs)),
      wirtschaftsplan: wp > 0 ? fmtEUR(wpSigned) : "",
    };
  });
}


function ownerAddr(assignment: any) {
  if (!assignment) return { street: "", zip: "", city: "" };
  const c = assignment.contacts || {};
  return {
    street: assignment.address_street_override ?? c.address_street ?? "",
    zip: assignment.address_zip_override ?? c.address_zip ?? "",
    city: assignment.address_city_override ?? c.address_city ?? "",
  };
}

function ownerSal(assignment: any) {
  if (!assignment) return "";
  const c = assignment.contacts || {};
  return assignment.salutation_override ?? c.salutation ?? "";
}

/**
 * Baut ein Payload für die Gesamtabrechnung.
 */
export function buildOverallPayload(inp: BillingPayloadInputs) {
  const { building, period, fiscalYear, sectionAccounts, totals, ownerResults, carryAccountsList = [] } = inp;
  const bestaende_anfang = carryAccountsList
    .filter((a) => Math.abs(a.opening) > 0.005)
    .map((a) => ({ konto_nr: a.account_number, konto_name: a.account_name, betrag: fmtEUR(Math.abs(a.opening)), kategorie: a.category }));
  const bestaende_ende = carryAccountsList
    .filter((a) => Math.abs(a.closing) > 0.005)
    .map((a) => ({ konto_nr: a.account_number, konto_name: a.account_name, betrag: fmtEUR(Math.abs(a.closing)), kategorie: a.category }));
  // Kombinierte Bestandsentwicklung pro Konto (Anfang + Ende in einer Zeile),
  // Brennstoff bewusst ausgenommen (separat in Vermögensbericht ausgewiesen).
  const carry_accounts = carryAccountsList
    .filter((a) => a.category !== "fuel")
    .filter((a) => Math.abs(a.opening) > 0.005 || Math.abs(a.closing) > 0.005)
    .map((a) => ({
      konto_nr: a.account_number,
      konto_name: a.account_name,
      anfangsbestand: fmtEUR(Math.abs(a.opening)),
      endbestand: fmtEUR(Math.abs(a.closing)),
      kategorie: a.category,
    }));
  // Einnahmen-Block: Vorschüsse Kostendeckung / EHR / Überzahlung als virtuelle Vorzeilen
  const einnahmenPrefix: any[] = [
    {
      konto_nr: "—",
      konto_name: "Vorschüsse zur Kostendeckung",
      verteiler: "",
      betrag: fmtEUR(totals.totalSollKostendeckung),
      betrag_abs: fmtEUR(Math.abs(totals.totalSollKostendeckung)),
      wirtschaftsplan: "",
    },
  ];
  if (totals.totalSollEHR > 0.005) {
    einnahmenPrefix.push({
      konto_nr: "—",
      konto_name: "Vorschüsse auf Erhaltungsrücklage",
      verteiler: "",
      betrag: fmtEUR(totals.totalSollEHR),
      betrag_abs: fmtEUR(Math.abs(totals.totalSollEHR)),
      wirtschaftsplan: "",
    });
  }
  if (Math.abs(totals.totalUeberzahlung) > 0.005) {
    einnahmenPrefix.push({
      konto_nr: "—",
      konto_name: "Überzahlung Vorschüsse",
      verteiler: "",
      betrag: fmtEUR(totals.totalUeberzahlung),
      betrag_abs: fmtEUR(Math.abs(totals.totalUeberzahlung)),
      wirtschaftsplan: "",
    });
  }
  const einnahmen_full = [...einnahmenPrefix, ...sectionListFromUi(sectionAccounts.income)];
  // Summe Einnahmen für PDF (Vorschüsse + Buchungseinnahmen wie Zinsen)
  const sumEinnahmenInkl =
    totals.totalSollKostendeckung +
    totals.totalSollEHR +
    Math.max(0, totals.totalUeberzahlung) +
    totals.incomeInterest +
    totals.incomeOther;

  // Ausgaben-Sektionen als negative Beträge ausgeben
  const bewirtschaftung = sectionListFromUi(sectionAccounts.operating_distributable, { asExpense: true });
  const nicht_umlagefaehig = sectionListFromUi(sectionAccounts.operating_non_distributable, { asExpense: true });
  const heizkosten = sectionListFromUi(sectionAccounts.heating, { asExpense: true });
  const ruecklage = sectionListFromUi(sectionAccounts.reserve, { asExpense: true });

  const sumIst = totals.totalOperatingDist + totals.totalOperatingNonDist + totals.totalReserve +
    (sectionAccounts.heating || []).reduce((s: number, a: any) => s + Math.abs(a.totalAbs || 0), 0);
  const sumWp = [
    ...(sectionAccounts.operating_distributable || []),
    ...(sectionAccounts.operating_non_distributable || []),
    ...(sectionAccounts.heating || []),
    ...(sectionAccounts.reserve || []),
  ].reduce((s: number, a: any) => s + Math.abs(a.wpAmount || 0), 0);
  const sumVerteilbar = totals.totalOperatingDist +
    (sectionAccounts.heating || []).reduce((s: number, a: any) => s + Math.abs(a.totalAbs || 0), 0);

  return {
    document_title: "Jahresabrechnung — Gesamt",
    gebaeude_name: building?.name || "",
    gebaeude_adresse: building?.address || "",
    wirtschaftsjahr: String(fiscalYear),
    periode_von: fmtDateDe(period?.period_from),
    periode_bis: fmtDateDe(period?.period_to),
    erstell_datum: fmtDateDe(new Date().toISOString()),
    verwalter_name: "RGI Immobilien GmbH & Co. KG",

    // Sektions-Listen (jede Position 1:1 wie in der UI-Section)
    einnahmen: einnahmen_full,
    einnahmen_nur_buchungen: sectionListFromUi(sectionAccounts.income),
    bewirtschaftung,
    nicht_umlagefaehig,
    heizkosten,
    ruecklage,
    abgrenzungen: sectionListFromUi(sectionAccounts.accrual, { asAccrual: true }),

    // Sektions-Summen (entspricht Spalten in der UI)
    sum_einnahmen: fmtEUR(totals.totalEinnahmen),
    sum_einnahmen_inkl_vorschuss: fmtEUR(sumEinnahmenInkl),
    sum_bewirtschaftung_umlagefaehig: fmtEUR(-Math.abs(totals.totalOperatingDist)),
    sum_bewirtschaftung_nicht_umlagefaehig: fmtEUR(-Math.abs(totals.totalOperatingNonDist)),
    sum_heizkosten: fmtEUR(
      -(sectionAccounts.heating || []).reduce((s: number, a: any) => s + Math.abs(a.totalAbs || 0), 0),
    ),
    sum_ruecklage: fmtEUR(-Math.abs(totals.totalReserve)),
    sum_ruecklage_entnahme: fmtEUR(totals.totalReserveWithdrawal),
    // Aggregierte Ausgaben-Summen (über alle Ausgabe-Sektionen)
    sum_ausgaben_ist: fmtEUR(-sumIst),
    sum_ausgaben_wp: fmtEUR(-sumWp),
    sum_ausgaben_verteilbar: fmtEUR(-sumVerteilbar),
    sum_abgrenzungen: fmtEUR(
      (sectionAccounts.accrual || []).reduce(
        (s: number, a: any) => s + Math.abs(a.totalAbs || 0) * getAccrualDisplaySign(a.account_number),
        0,
      ),
    ),
    sum_abrechnung: fmtEUR(totals.abrechnungssumme),
    sum_vorschuss: fmtEUR(totals.totalVorschuss),
    sum_vorschuss_kostendeckung: fmtEUR(totals.totalSollKostendeckung),
    sum_vorschuss_ehr: fmtEUR(totals.totalSollEHR),
    sum_vorschuss_ueberzahlung: fmtEUR(totals.totalUeberzahlung),
    sum_soll_kostendeckung: fmtEUR(totals.totalSollKostendeckung),
    sum_soll_ehr: fmtEUR(totals.totalSollEHR),
    sum_zinseinnahmen: fmtEUR(totals.incomeInterest),
    sum_sonstige_ertraege: fmtEUR(totals.incomeOther),
    abrechnungsspitze: fmtEUR(Math.abs(totals.abrechnungsspitze)),
    abrechnungsspitze_label: totals.abrechnungsspitze >= 0 ? "Guthaben" : "Nachzahlung",
    abrechnungsspitze_guthaben: totals.abrechnungsspitze >= 0,
    abrechnungsspitze_nachzahlung: totals.abrechnungsspitze < 0,

    // Vermögensbericht / Kontrollbestände
    bank_anfangsbestand: fmtEUR(Math.abs(totals.openingGiro)),
    bank_endbestand: fmtEUR(Math.abs(totals.closingGiro)),
    ruecklage_anfangsbestand: fmtEUR(Math.abs(totals.openingReserve)),
    ruecklage_endbestand: fmtEUR(Math.abs(totals.closingReserve)),
    brennstoff_anfangsbestand: fmtEUR(Math.abs(totals.openingFuel)),
    brennstoff_endbestand: fmtEUR(Math.abs(totals.closingFuel)),
    vorauszahlungen_anfangsbestand: fmtEUR(Math.abs(totals.openingPrepay)),
    vorauszahlungen_endbestand: fmtEUR(Math.abs(totals.closingPrepay)),
    sonstige_anfangsbestand: fmtEUR(Math.abs(totals.openingOther)),
    sonstige_endbestand: fmtEUR(Math.abs(totals.closingOther)),
    bestaende_anfang_gesamt: fmtEUR(Math.abs(totals.openingTotal)),
    bestaende_ende_gesamt: fmtEUR(Math.abs(totals.closingTotal)),

    // Per-Konto-Listen (DOCX-Loops {#bestaende_anfang}/{#bestaende_ende})
    bestaende_anfang,
    bestaende_ende,
    carry_accounts,

    // Eigentümer-Tabelle (Übersicht)
    eigentuemer: ownerResults.map((o) => ({
      name: o.name,
      einheit_nr: o.unitNumber,
      kostenanteil: fmtEUR(o.totalOwnerCost),
      vorschuss: fmtEUR(o.totalPaid),
      ergebnis: fmtEUR(o.result),
      ergebnis_label: o.result >= 0 ? "Guthaben" : "Nachzahlung",
    })),
  };
}

/**
 * Baut ein Payload für die Einzelabrechnung eines Eigentümers.
 */
export function buildOwnerPayload(inp: BillingPayloadInputs, ownerId: string) {
  const { building, period, fiscalYear, ownerResults, assignmentsById } = inp;
  const owner = ownerResults.find((o) => o.assignmentId === ownerId);
  if (!owner) throw new Error(`Eigentümer ${ownerId} nicht gefunden`);

  const assignment = assignmentsById?.[ownerId];
  const addr = ownerAddr(assignment);

  // Konten gruppiert nach Sektion (entspricht 7-Spalten-Tabelle in der UI)
  const groupOrder = [
    "operating_distributable",
    "operating_non_distributable",
    "heating",
    "reserve",
  ];
  const sektionen = groupOrder
    .map((sec) => {
      const rows = owner.accountBreakdown.filter((r) => r.displaySection === sec);
      if (rows.length === 0) return null;
      return {
        sektion: SECTION_LABELS[sec] || sec,
        zeilen: rows.map((r) => ({
          konto_nr: r.accountNumber,
          konto_name: r.signedFactor < 0 ? `./. ${r.accountName} (aus Rücklage)` : r.accountName,
          verteilungsrelevant: fmtEUR(r.distributableAmount),
          verteiler: r.distKey,
          gesamt_anteil: fmtNum(r.totalShares, 3),
          ihr_anteil: fmtNum(r.ownerShare, 3),
          ihre_kosten: fmtEUR(r.ownerCost),
        })),
        zwischensumme: fmtEUR(rows.reduce((s, r) => s + r.ownerCost, 0)),
      };
    })
    .filter(Boolean);

  const steuerbonus =
    Math.min(owner.owner35aDienste * 0.2, 4000) +
    Math.min(owner.owner35aHandwerker * 0.2, 1200);

  return {
    document_title: "Jahresabrechnung — Einzelabrechnung",
    gebaeude_name: building?.name || "",
    gebaeude_adresse: building?.address || "",
    wirtschaftsjahr: String(fiscalYear),
    periode_von: fmtDateDe(period?.period_from),
    periode_bis: fmtDateDe(period?.period_to),
    erstell_datum: fmtDateDe(new Date().toISOString()),
    verwalter_name: "RGI Immobilien GmbH & Co. KG",

    empfaenger_anrede: ownerSal(assignment),
    empfaenger_name: owner.name,
    empfaenger_strasse: addr.street,
    empfaenger_plz: addr.zip,
    empfaenger_ort: addr.city,
    einheit_nr: owner.unitNumber,
    einheit_lage: assignment?.floor_location || "",
    zeitanteil: `${Math.round((owner.timeProp || 1) * 100)}%`,

    // Sektions-Tabellen
    sektionen,

    // Summen
    sum_abrechnung: fmtEUR(owner.totalOwnerCost),
    sum_hausgeld: fmtEUR(owner.hausgeld),
    sum_ruecklage_vorschuss: fmtEUR(owner.reserve),
    sum_vorschuss: fmtEUR(owner.totalPaid),
    abrechnungsspitze: fmtEUR(Math.abs(owner.result)),
    abrechnungsspitze_label: owner.result >= 0 ? "Guthaben" : "Nachzahlung",
    abrechnungsspitze_guthaben: owner.result >= 0,
    abrechnungsspitze_nachzahlung: owner.result < 0,

    // §35a Block
    has_35a: owner.owner35aDienste > 0 || owner.owner35aHandwerker > 0,
    summe_35a_dienste: fmtEUR(owner.owner35aDienste),
    summe_35a_handwerker: fmtEUR(owner.owner35aHandwerker),
    steuerbonus_35a: fmtEUR(steuerbonus),
  };
}

export function buildPayloads(inp: BillingPayloadInputs, mode: "single" | "all", ownerId?: string) {
  if (mode === "single" && ownerId) {
    return [{ kind: "owner" as const, ownerId, payload: buildOwnerPayload(inp, ownerId) }];
  }
  // mode "all": Gesamt + jeder Eigentümer
  const out: Array<{ kind: "overall" | "owner"; ownerId?: string; payload: any }> = [
    { kind: "overall", payload: buildOverallPayload(inp) },
  ];
  for (const o of inp.ownerResults) {
    out.push({ kind: "owner", ownerId: o.assignmentId, payload: buildOwnerPayload(inp, o.assignmentId) });
  }
  return out;
}
