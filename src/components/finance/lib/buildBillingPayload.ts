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
    actualPaid?: number;
    ownerUeberzahlung?: number;
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

function sectionListFromUi(accs: any[] = [], opts: { asExpense?: boolean; asAccrual?: boolean; asIncome?: boolean } = {}) {
  return accs.map((a) => {
    const abs = Math.abs(a.totalAbs || 0);
    let signed: number;
    if (opts.asAccrual) {
      signed = abs * getAccrualDisplaySign(a.account_number);
    } else if (opts.asExpense) {
      signed = -abs;
    } else if (opts.asIncome) {
      signed = abs;
    } else {
      signed = a.total;
    }
    const wp = Math.abs(a.wpAmount || 0);
    const wpSigned = opts.asAccrual
      ? wp * getAccrualDisplaySign(a.account_number)
      : opts.asExpense ? -wp
      : opts.asIncome ? wp
      : a.wpAmount;
    const verteilbarBase = a.distributableAmount ?? abs;
    const verteilbar = opts.asExpense ? -Math.abs(verteilbarBase)
      : opts.asIncome ? Math.abs(verteilbarBase)
      : verteilbarBase;
    // Verteilbar nur ausgeben, wenn das Konto tatsächlich verteilungsrelevant ist.
    // Nicht-distributable Konten (z. B. Kapitalertragsteuer, Soli) würden sonst
    // einen Wert in der Verteilbar-Spalte zeigen, obwohl sie nicht summiert werden.
    const isDist = a.is_distributable === true;
    return {
      konto_nr: a.account_number,
      konto_name: a.account_name,
      verteiler: a.distKeyLabel || a.distKey || "",
      betrag: fmtEUR(signed),
      betrag_abs: fmtEUR(abs),
      betrag_ist: fmtEUR(signed),
      betrag_verteilbar: isDist ? fmtEUR(verteilbar) : "",
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
  const einnahmen_full = [...einnahmenPrefix, ...sectionListFromUi(sectionAccounts.income, { asIncome: true })];
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

  // Per-Sektion-Subtotale (Plan / Ist / Verteilbar) — alle als negative
  // Aufwandsbeträge formatiert, damit DOCX-Zwischensummenzeilen vorzeichen-
  // konsistent zu den Einzelpositionen erscheinen.
  const subtotals = (accs: any[] = []) => {
    const ist = accs.reduce((s, a) => s + Math.abs(a.totalAbs || 0), 0);
    const plan = accs.reduce((s, a) => s + Math.abs(a.wpAmount || 0), 0);
    const verteilbar = accs
      .filter((a) => a.is_distributable === true)
      .reduce((s, a) => s + Math.abs(a.totalAbs || 0), 0);
    return { ist: fmtEUR(-ist), plan: fmtEUR(-plan), verteilbar: fmtEUR(-verteilbar) };
  };
  const sub_bewirtschaftung = subtotals(sectionAccounts.operating_distributable);
  const sub_nicht_umlagefaehig = subtotals(sectionAccounts.operating_non_distributable);
  const sub_heizkosten = subtotals(sectionAccounts.heating);
  const sub_ruecklage = subtotals(sectionAccounts.reserve);

  const sumIst = totals.totalOperatingDist + totals.totalOperatingNonDist + totals.totalReserve +
    (sectionAccounts.heating || []).reduce((s: number, a: any) => s + Math.abs(a.totalAbs || 0), 0);
  const sumWp = [
    ...(sectionAccounts.operating_distributable || []),
    ...(sectionAccounts.operating_non_distributable || []),
    ...(sectionAccounts.heating || []),
    ...(sectionAccounts.reserve || []),
  ].reduce((s: number, a: any) => s + Math.abs(a.wpAmount || 0), 0);
  // Verteilbare Gesamtausgaben — MUSS exakt totals.abrechnungssumme entsprechen
  // (gemeinsame Quelle UI ↔ PDF, verhindert Vorzeichen-/Wert-Drift). Die alte
  // lokale Aggregation über alle Sektionen führte zur Doppelzählung der
  // IHR-Zuführung im PDF (Differenz zur UI-Anzeige).
  const sumVerteilbar = totals.abrechnungssumme;

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
    einnahmen_nur_buchungen: sectionListFromUi(sectionAccounts.income, { asIncome: true }),
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
    // Per-Sektion Zwischensummen für DOCX-Spalten Plan / Ist / Verteilbar
    sum_bewirtschaftung_plan: sub_bewirtschaftung.plan,
    sum_bewirtschaftung_ist: sub_bewirtschaftung.ist,
    sum_bewirtschaftung_verteilbar: sub_bewirtschaftung.verteilbar,
    sum_nicht_umlagefaehig_plan: sub_nicht_umlagefaehig.plan,
    sum_nicht_umlagefaehig_ist: sub_nicht_umlagefaehig.ist,
    sum_nicht_umlagefaehig_verteilbar: sub_nicht_umlagefaehig.verteilbar,
    sum_heizkosten_plan: sub_heizkosten.plan,
    sum_heizkosten_ist: sub_heizkosten.ist,
    sum_heizkosten_verteilbar: sub_heizkosten.verteilbar,
    sum_ruecklage_plan: sub_ruecklage.plan,
    sum_ruecklage_ist: sub_ruecklage.ist,
    sum_ruecklage_verteilbar: sub_ruecklage.verteilbar,
    // Aggregierte Ausgaben-Summen (über alle Ausgabe-Sektionen)
    sum_ausgaben_ist: fmtEUR(-sumIst),
    sum_ausgaben_wp: fmtEUR(-sumWp),
    sum_ausgaben_verteilbar: fmtEUR(-sumVerteilbar),
    sum_abgrenzungen: (() => {
      const v = (sectionAccounts.accrual || []).reduce(
        (s: number, a: any) => s + Math.abs(a.totalAbs || 0) * getAccrualDisplaySign(a.account_number),
        0,
      );
      return fmtEUR(v);
    })(),
    sum_abgrenzungen_ist: fmtEUR(
      (sectionAccounts.accrual || []).reduce(
        (s: number, a: any) => s + Math.abs(a.totalAbs || 0) * getAccrualDisplaySign(a.account_number),
        0,
      ),
    ),
    sum_abgrenzungen_plan: fmtEUR(0),
    sum_abgrenzungen_verteilbar: fmtEUR(
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

    // === Abrechnungssaldo (HV-Office-konform) ===
    // Für die Abrechnungssaldo-Zeile in der Gesamtabrechnung MÜSSEN diese
    // Platzhalter verwendet werden (NICHT sum_einnahmen_inkl_vorschuss, das
    // Überzahlungen + Zinsen mit einrechnet, was hier nicht erwünscht ist):
    //   - Einnahmen  = Soll-Vorschüsse (Kostendeckung + EHR), OHNE Überzahlung
    //   - Ausgaben   = verteilungsrelevante Gesamtausgaben (sum_ausgaben_verteilbar)
    //   - Saldo      = Soll-Vorschüsse + verteilbare Ausgaben (Ausgaben sind negativ)
    sum_einnahmen_vorschuss_soll: fmtEUR(totals.totalSollKostendeckung + totals.totalSollEHR),
    abrechnungssaldo_soll: fmtEUR(
      (totals.totalSollKostendeckung + totals.totalSollEHR) - sumVerteilbar,
    ),
    abrechnungssaldo_soll_abs: fmtEUR(
      Math.abs((totals.totalSollKostendeckung + totals.totalSollEHR) - sumVerteilbar),
    ),
    abrechnungssaldo_soll_label:
      (totals.totalSollKostendeckung + totals.totalSollEHR) - sumVerteilbar >= 0
        ? "Guthaben" : "Nachzahlung",
    abrechnungssaldo_soll_guthaben:
      (totals.totalSollKostendeckung + totals.totalSollEHR) - sumVerteilbar >= 0,
    abrechnungssaldo_soll_nachzahlung:
      (totals.totalSollKostendeckung + totals.totalSollEHR) - sumVerteilbar < 0,

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
  const { building, period, fiscalYear, ownerResults, assignmentsById, totals } = inp;
  const owner = ownerResults.find((o) => o.assignmentId === ownerId);
  if (!owner) throw new Error(`Eigentümer ${ownerId} nicht gefunden`);

  const assignment = assignmentsById?.[ownerId];
  const addr = ownerAddr(assignment);

  // HV-Office Verteiler-Labels (überschreiben den rohen distKey für die Vorlage)
  const VERTEILER_LABELS: Record<string, string> = {
    mea: "Ges.Tausendstel",
    einheit: "Einheiten",
    qm: "qm",
    stellplaetze: "TG-Stellplätze",
    personen: "Personen",
    heizk_abr: "Heizk.Abr",
    heizkostenverordnung: "Heizkostenverordnung",
    heating_individual: "Heizkostenverordnung",
  };
  const verteilerLabel = (k: string) => VERTEILER_LABELS[k] || k || "";

  // Sektionen-Reihenfolge entspricht HV-Office-Layout. Heizkonten werden in
  // "operating_distributable" gemerged (eigene Zeile mit Verteiler "Heizk.Abr").
  const groupOrder: Array<{ key: string; sources: string[] }> = [
    { key: "income", sources: ["income"] },
    { key: "operating_distributable", sources: ["operating_distributable", "heating"] },
    { key: "operating_non_distributable", sources: ["operating_non_distributable"] },
    { key: "reserve", sources: ["reserve"] },
  ];

  const sektionen = groupOrder
    .map(({ key, sources }) => {
      const rows = owner.accountBreakdown.filter((r) => sources.includes(r.displaySection));
      if (key !== "income" && rows.length === 0) return null;
      const sumGesamt = rows.reduce((s, r) => s + (r.distributableAmount || 0), 0);
      const sumIhre = rows.reduce((s, r) => s + (r.ownerCost || 0), 0);
      return {
        sektion: SECTION_LABELS[key] || key,
        zeilen: rows.map((r) => ({
          konto_nr: r.accountNumber,
          konto_name: r.signedFactor < 0 ? `./. ${r.accountName} (aus Rücklage)` : r.accountName,
          verteilungsrelevant: fmtEUR(r.distributableAmount),
          verteiler: verteilerLabel(r.distKey),
          gesamt_anteil: fmtNum(r.totalShares, 3),
          ihr_anteil: fmtNum(r.ownerShare, 3),
          ihre_kosten: fmtEUR(r.ownerCost),
        })),
        zwischensumme_gesamt: fmtEUR(sumGesamt),
        zwischensumme_ihre_kosten: fmtEUR(sumIhre),
        // Alias für bestehende Vorlagen
        zwischensumme: fmtEUR(sumIhre),
      };
    })
    .filter(Boolean);

  const steuerbonus =
    Math.min(owner.owner35aDienste * 0.2, 4000) +
    Math.min(owner.owner35aHandwerker * 0.2, 1200);

  // Spitze (nur Soll-Vorschuss vs. Kosten) — analog Gesamtabrechnung-Logik
  const ownerSollVorschuss = owner.hausgeld + owner.reserve;
  const ownerSpitze = ownerSollVorschuss - owner.totalOwnerCost;
  // Persönliche Überzahlung: ausschließlich aus dem IST-Saldo des
  // eigenen Personenkontos dieses Eigentümers (in BillingSettlement
  // berechnet als owner.ownerUeberzahlung). Fällt zurück auf 0, wenn
  // kein Personenkonto gematcht werden konnte.
  const ownerActualPaid = typeof owner.actualPaid === "number" ? owner.actualPaid : owner.totalPaid;
  const ownerUeberzahlung = typeof owner.ownerUeberzahlung === "number"
    ? owner.ownerUeberzahlung
    : Math.max(0, ownerActualPaid - ownerSollVorschuss);
  // Saldo = Spitze + eigene Überzahlung. Die persönliche Überbezahlung
  // verbleibt damit beim Verursacher und wird nicht in die WEG-Gesamt-
  // sicht eingerechnet.
  const ownerSaldo = ownerSpitze + ownerUeberzahlung;

  // WEG-Gesamt-Saldo zeigt ausschließlich die Spitze (Kosten vs. Soll-
  // Hausgeld) — KEINE persönlichen Überzahlungen einzelner Eigentümer.
  const wegSollVorschuss = totals.totalSollKostendeckung + totals.totalSollEHR;
  const wegVorschussIst = totals.totalSollKostendeckung + totals.totalSollEHR + Math.max(0, totals.totalUeberzahlung);
  const wegSaldo = totals.abrechnungsspitze;

  const ghnz = (v: number) => (v >= 0 ? "GH" : "NZ");

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

    // Abrechnungssumme (zweispaltig)
    sum_abrechnung_gesamt: fmtEUR(-Math.abs(totals.abrechnungssumme)),
    sum_abrechnung_ihre: fmtEUR(-Math.abs(owner.totalOwnerCost)),

    // Vorschussverpflichtung gem. Wirtschaftsplan (Soll, zweispaltig)
    sum_vorschuss_wp_gesamt: fmtEUR(wegSollVorschuss),
    sum_vorschuss_wp_ihre: fmtEUR(ownerSollVorschuss),

    // Abrechnungsspitze (zweispaltig + GH/NZ)
    abrechnungsspitze_gesamt: fmtEUR(Math.abs(totals.abrechnungsspitze)),
    abrechnungsspitze_ihre: fmtEUR(Math.abs(ownerSpitze)),
    abrechnungsspitze_label: ghnz(ownerSpitze),
    abrechnungsspitze_guthaben: ownerSpitze >= 0,
    abrechnungsspitze_nachzahlung: ownerSpitze < 0,

    // Block "zusätzliche Informationen"
    vorschuss_ist_gesamt: fmtEUR(wegVorschussIst),
    vorschuss_ist_ihre: fmtEUR(ownerActualPaid),
    // Überzahlung nur in der Ihr-Anteil-Spalte (persönlich), Gesamt = 0.
    // has_ueberzahlung steuert die Anzeige der Zeile in der Vorlage —
    // sie erscheint nur, wenn DIESER Eigentümer überzahlt hat.
    has_ueberzahlung: ownerUeberzahlung > 0.005,
    ueberzahlung_wpl_gesamt: fmtEUR(0),
    ueberzahlung_wpl_ihre: fmtEUR(ownerUeberzahlung),
    abrechnungssaldo_gesamt: fmtEUR(Math.abs(wegSaldo)),
    abrechnungssaldo_ihre: fmtEUR(Math.abs(ownerSaldo)),
    abrechnungssaldo_label: ghnz(ownerSaldo),
    abrechnungssaldo_guthaben: ownerSaldo >= 0,
    abrechnungssaldo_nachzahlung: ownerSaldo < 0,


    // Aliase (Rückwärtskompatibilität)
    sum_abrechnung: fmtEUR(owner.totalOwnerCost),
    sum_hausgeld: fmtEUR(owner.hausgeld),
    sum_ruecklage_vorschuss: fmtEUR(owner.reserve),
    sum_vorschuss: fmtEUR(owner.totalPaid),
    abrechnungsspitze: fmtEUR(Math.abs(owner.result)),

    // §35a Block
    has_35a: owner.owner35aDienste > 0 || owner.owner35aHandwerker > 0,
    summe_35a_dienste: fmtEUR(owner.owner35aDienste),
    summe_35a_handwerker: fmtEUR(owner.owner35aHandwerker),
    steuerbonus_35a: fmtEUR(steuerbonus),
  };
}

/**
 * Baut ein Payload für den Vermögensbericht (HV-Office Layout):
 * 5 Sektionen — Liquide Mittel, Guthaben/Nachzahlung, Abgrenzungen,
 * Forderungen Vorjahr, Verbindlichkeiten Vorjahr — plus Gesamtvermögensstand.
 */
export function buildAssetReportPayload(inp: BillingPayloadInputs) {
  const { building, period, fiscalYear, sectionAccounts, totals, ownerResults, carryAccountsList = [] } = inp;

  // Sektion 1: Liquide Mittel (Bank + Rücklage + Brennstoff + Sonstige Bestände)
  const liquideRows = carryAccountsList
    .filter((a) => Math.abs(a.closing) > 0.005)
    .filter((a) => ["bank", "reserve", "fuel", "other"].includes(a.category))
    .map((a) => ({
      konto_nr: a.account_number,
      konto_name: a.account_name,
      bezeichnung: a.account_name,
      betrag: fmtEUR(a.closing),
      betrag_raw: a.closing,
    }));
  const sumLiquide = liquideRows.reduce((s, r) => s + r.betrag_raw, 0);

  // Sektion 2: Guthaben & Nachzahlungen aus Abrechnung
  const sumGuthaben = ownerResults.reduce((s, o) => s + Math.max(0, o.result), 0);    // owner-Guthaben → WEG-Verbindlichkeit
  const sumNachzahlung = ownerResults.reduce((s, o) => s + Math.max(0, -o.result), 0); // owner-Nachzahlung → WEG-Forderung
  const guthabenRows = [
    { bezeichnung: "Guthaben aus Abr.",     betrag: fmtEUR(-sumGuthaben),    betrag_raw: -sumGuthaben },
    { bezeichnung: "Nachzahlung aus Abr.",  betrag: fmtEUR(sumNachzahlung),  betrag_raw: sumNachzahlung },
  ];
  const sumGuthabenNachzahlung = -sumGuthaben + sumNachzahlung;

  // Helper: Summen pro Abgrenzungs-Range
  const accrualAccs = sectionAccounts.accrual || [];
  const sumRange = (lo: number, hi: number) =>
    accrualAccs
      .filter((a) => {
        const n = parseInt(String(a.account_number), 10);
        return !Number.isNaN(n) && n >= lo && n <= hi;
      })
      .reduce((s: number, a: any) => s + Math.abs(a.totalAbs || 0), 0);

  // Helper: Konten in Range filtern + nach Kontonummer sortieren
  const accsInRange = (lo: number, hi: number) =>
    accrualAccs
      .filter((a) => {
        const n = parseInt(String(a.account_number), 10);
        return !Number.isNaN(n) && n >= lo && n <= hi;
      })
      .sort((a: any, b: any) => String(a.account_number).localeCompare(String(b.account_number)));

  // ============================================================
  // Sektion 3: Zu- und Abflüsse aus Jahresabgrenzung
  //   = NEUE Abgrenzungen, die im lfd. Jahr gebildet werden
  //     für das Folgejahr (Konten 4140–4199).
  //   Vorzeichen aus Vermögenssicht (umgekehrt zur Abrechnungssicht):
  //     4160 (Ausg. im Folgejahr für lfd. J., PRA-Bildung) → Verbindlichkeit → −
  //     4180 (Einn. im Folgejahr für lfd. J., ARA-Bildung) → Forderung      → +
  //   Eine Zeile PRO Konto mit dem echten account_name aus dem COA,
  //   damit die Vorlage exakt die UI-Bezeichnungen zeigt.
  // ============================================================
  const abgFolgeAccs = accsInRange(4140, 4199);
  const abgrenzungRows = abgFolgeAccs
    .map((a: any) => {
      // Vermögensbericht-Vorzeichen = − Abrechnungs-Vorzeichen
      const raw = Math.abs(a.totalAbs || 0) * (-getAccrualDisplaySign(a.account_number));
      return {
        konto_nr: a.account_number,
        bezeichnung: a.account_name,
        betrag: fmtEUR(raw),
        betrag_raw: raw,
      };
    })
    .filter(r => Math.abs(r.betrag_raw) >= 0.005);
  const sumAbgrenzung = abgrenzungRows.reduce((s, r) => s + r.betrag_raw, 0);

  // ============================================================
  // Sektion 4: Forderungen zum Jahresende
  //   = AUFLÖSUNG der Abgrenzungen aus dem Vorjahr im lfd. Jahr
  //     (Konten 4100–4139). Im Vermögensbericht stets positiv dargestellt
  //     (Forderung der WEG gegen Eigentümer aus Vorjahr = Vermögen).
  //   Eine Zeile PRO Konto mit echtem account_name.
  // ============================================================
  const forderungAccs = accsInRange(4100, 4139);
  const forderungenRows = forderungAccs
    .map((a: any) => {
      const raw = Math.abs(a.totalAbs || 0);
      return {
        konto_nr: a.account_number,
        bezeichnung: a.account_name,
        betrag: fmtEUR(raw),
        betrag_raw: raw,
      };
    })
    .filter(r => Math.abs(r.betrag_raw) >= 0.005);
  const sumForderungen = forderungenRows.reduce((s, r) => s + r.betrag_raw, 0);

  // Sektion 5: Verbindlichkeiten zum Jahresende (aktuell leer — strukturell vorhanden)
  const verbindlichkeitenRows: Array<{ bezeichnung: string; betrag: string; betrag_raw: number }> = [];
  const sumVerbindlichkeiten = 0;

  const stichtag = period?.period_to ? fmtDateDe(period.period_to) : `31.12.${fiscalYear}`;
  const vermoegensstandGesamt =
    sumLiquide + sumGuthabenNachzahlung + sumAbgrenzung + sumForderungen + sumVerbindlichkeiten;

  // Brennstoff-Detailblock (optional, Conditional {#has_brennstoff})
  const fuelRows = carryAccountsList
    .filter((a) => a.category === "fuel" && Math.abs(a.closing) > 0.005)
    .map((a) => ({ konto_nr: a.account_number, konto_name: a.account_name, betrag: fmtEUR(a.closing) }));

  return {
    document_title: `Vermögensbericht ${fiscalYear}`,
    gebaeude_name: building?.name || "",
    gebaeude_adresse: building?.address || "",
    wirtschaftsjahr: String(fiscalYear),
    stichtag,
    erstell_datum: fmtDateDe(new Date().toISOString()),
    verwalter_name: "RGI Immobilien GmbH & Co. KG",

    // Sektions-Listen
    liquide_mittel: liquideRows,
    guthaben_nachzahlung: guthabenRows,
    abgrenzung: abgrenzungRows,
    forderungen: forderungenRows,
    verbindlichkeiten: verbindlichkeitenRows,

    // Zwischensummen
    sum_liquide_mittel: fmtEUR(sumLiquide),
    sum_guthaben_nachzahlung: fmtEUR(sumGuthabenNachzahlung),
    sum_abgrenzung: fmtEUR(sumAbgrenzung),
    sum_forderungen: fmtEUR(sumForderungen),
    sum_verbindlichkeiten: fmtEUR(sumVerbindlichkeiten),

    // Gesamtvermögensstand
    vermoegensstand_gesamt: fmtEUR(vermoegensstandGesamt),
    vermoegensstand_label: `Vermögensstand zum ${stichtag}`,

    // Brennstoff-Detail (optional)
    has_brennstoff: fuelRows.length > 0,
    brennstoff_details: fuelRows,
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
