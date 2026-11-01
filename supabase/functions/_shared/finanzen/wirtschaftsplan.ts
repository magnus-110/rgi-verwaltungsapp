// Wirtschaftsplan (Gesamt- und Einzelwirtschaftspläne) – EINE Berechnung für App und Server.
// Genutzt vom Editor (src/components/finance/ManualEconomicPlanEditor.tsx) und von der
// Edge Function finanz-dokumente (Claude-Konnektor). Reiner Code: keine React-, Supabase-
// oder Browser-Abhängigkeiten – läuft im Browser und in Deno gleich.
import { isReserveContributionAccount } from "./kontoKlassifikation.ts";
import { unitFilePrefix } from "./unitFilePrefix.ts";
import { ladeBuchungenJahr } from "./abfragen.ts";

export interface PlanZeile {
  account_id: string;
  account_number: string;
  account_name: string;
  category?: string | null;
  distribution_key?: string | null;
  planned_amount: number;
  manually_overridden?: boolean;
  isReserve?: boolean;
  isDistributable?: boolean;
  isWpRelevant?: boolean;
  previousAmount?: number | null;
  totalShare?: number | null;
  yourShare?: number | null;
  totalAmount?: number | null;
}

/** Rohdaten – genau die Abfragen des Editors */
export interface WirtschaftsplanDaten {
  building: { name?: string | null; address?: string | null; postal_code?: string | null; city?: string | null; manager_name?: string | null } | null;
  /** economic_plans-Zeile inkl. economic_plan_items(*) */
  plan: any | null;
  /** chart_of_accounts (building_id null oder = Objekt), sortiert nach account_number */
  allAccounts: any[];
  /** building_account_overrides (account_id, distribution_key) */
  accountOverrides: any[];
  /** bookings des Vorjahres (account_id, counter_account_id, amount, booking_category) */
  prevYearBookings: any[];
  /** heating_distribution_values des Vorjahres (assignment_id, amount) */
  heatingPrev: any[];
  /** contact_building_assignments (Eigentümer) mit contacts und contact_building_shares */
  assignmentsRaw: any[];
  /** economic_plan_unit_items des Plans */
  unitItems: any[];
}

export interface WirtschaftsplanOptionen {
  fiscalYear: number;
  showAllAccounts?: boolean;
  /** ungespeicherte Eingaben im Editor */
  drafts?: Record<string, number>;
  unitDrafts?: Record<string, number>;
  /** Standard: aus plan.adjustments */
  monthlyTotalOverrides?: Record<string, number>;
  monthlyAdvanceOverrides?: Record<string, number>;
  /** Erstelldatum im Dokument (Standard: heute) */
  heute?: Date;
}

const DISTRIBUTION_KEY_LABELS: Record<string, string> = {
  mea: "MEA",
  einheit: "Einheiten",
  einheiten: "Einheiten",
  units: "Einheiten",
  qm: "pro m²",
  stellplaetze: "pro Stellplatz",
  personen: "pro Person",
  heizk_abr: "Heizkostenabrechnung",
  heizkostenverordnung: "Heizkostenverordnung",
  heating_individual: "Heizkostenverordnung",
};
export const distLabel = (k: string | null | undefined) =>
  DISTRIBUTION_KEY_LABELS[String(k || "").toLowerCase()] || k || "—";

/** Schlüssel auf intern normalisieren */
export const normalizeKey = (k?: string | null): string => {
  const v = String(k || "mea").toLowerCase();
  if (v === "einheiten") return "einheit";
  if (
    v === "verbrauch_heizung" ||
    v === "heizk.abr" ||
    v === "heizk_abr" ||
    v === "heizkostenverordnung" ||
    v === "heizkostenv" ||
    v === "heating_individual" ||
    v === "heizkosten"
  ) return "heizk_abr";
  return v;
};

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const splitAddress = (addr: string): { street: string; zipCity: string } => {
  const parts = (addr || "").split(",").map((s) => s.trim());
  if (parts.length >= 2) return { street: parts[0], zipCity: parts.slice(1).join(", ") };
  return { street: addr || "", zipCity: "" };
};

const pctChange = (cur: number, prev: number): string => {
  if (!prev) return "—";
  return `${(((cur - prev) / Math.abs(prev)) * 100).toFixed(1)} %`;
};

const datumDe = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(d);

/** Einheitennummer eines Eigentümer-Datensatzes (ohne Platzhalter "–"). */
export const unitNo = (o: any): string => {
  const u = String(o?.unitNumber || "").trim();
  return u && u !== "–" ? u : "";
};

export function berechneWirtschaftsplan(daten: WirtschaftsplanDaten, opt: WirtschaftsplanOptionen) {
  const { building, plan, allAccounts, accountOverrides, prevYearBookings, heatingPrev, assignmentsRaw, unitItems } = daten;
  const fiscalYear = opt.fiscalYear;
  const drafts = opt.drafts ?? {};
  const unitDrafts = opt.unitDrafts ?? {};
  const adj: any = plan?.adjustments || {};
  const monthlyTotalOverrides: Record<string, number> = opt.monthlyTotalOverrides ?? (adj.monthlyTotalOverrides && typeof adj.monthlyTotalOverrides === "object" ? adj.monthlyTotalOverrides : {});
  const monthlyAdvanceOverrides: Record<string, number> = opt.monthlyAdvanceOverrides ?? (adj.monthlyAdvanceOverrides && typeof adj.monthlyAdvanceOverrides === "object" ? adj.monthlyAdvanceOverrides : {});

  const overrideKeyByAccount = new Map<string, string>();
  for (const o of accountOverrides) if (o.distribution_key) overrideKeyByAccount.set(o.account_id, o.distribution_key);

  // ── Vorjahres-Brunata-Werte (für Hochrechnung Konto 1400 / heizk_abr) ──
  const heatingByAssignment: Record<string, number> = {};
  (heatingPrev as any[]).forEach((h) => { heatingByAssignment[h.assignment_id] = Number(h.amount) || 0; });
  const heatingTotal = Object.values(heatingByAssignment).reduce((s, v) => s + v, 0);

  const sumForAccount = (accId: string): number => {
    // Heizkosten-Umbuchungen (heating_repost) werden NICHT ausgeblendet:
    // sie entlasten das Quellkonto (z. B. 1050 Allgemeinstrom → Heizungsstrom)
    // und belasten 1400. Nur so zeigt die Vorjahres-IST-Spalte echte Nettowerte.
    return (prevYearBookings as any[]).reduce((s, b) => {
      const amt = Number(b.amount) || 0;
      if (b.account_id === accId) return s + amt;
      if (b.counter_account_id === accId) return s - amt;
      return s;
    }, 0);
  };

  // Effektive Konten: Default = NUR WP-relevant markierte Konten.
  const accounts = opt.showAllAccounts ? (allAccounts as any[]) : (allAccounts as any[]).filter((a) => !!a.is_wirtschaftsplan_relevant);

  // ── Wohnfläche der Liegenschaft (Σ area_sqm_override) ─────────────
  const totalAreaSqm = (assignmentsRaw as any[]).reduce((s, a) => {
    const v = Number(a.area_sqm_override || 0);
    return s + (isFinite(v) ? v : 0);
  }, 0);

  // Nur der billing_mode entscheidet über eine eigene Plan-Zeile — NICHT die unit_kind.
  const assignments = (assignmentsRaw as any[]).filter((a) => a?.billing_mode !== "distribution_only");

  // ── Zeilen: Plan-Positionen + Konten ──────────────────────────────
  // Der gebäudespezifische Verteilerschlüssel (override) bzw. der aktuelle
  // default_distribution_key des Kontos hat IMMER Vorrang vor einem ggf.
  // veralteten distribution_key in einem economic_plan_items-Datensatz.
  const items = (plan?.economic_plan_items || []) as any[];
  const rows: PlanZeile[] = accounts.map((acc: any) => {
    const item = items.find((i) => i.account_id === acc.id);
    const draft = drafts[acc.id];
    const effectiveDefaultKey = overrideKeyByAccount.get(acc.id) || acc.default_distribution_key || "mea";
    return {
      account_id: acc.id,
      account_number: acc.account_number,
      account_name: acc.account_name,
      category: acc.settlement_section || acc.category || "Sonstige",
      distribution_key: effectiveDefaultKey,
      planned_amount: draft !== undefined ? draft : Number(item?.planned_amount || 0),
      manually_overridden: draft !== undefined || !!item?.manually_overridden,
      isDistributable: !!acc.is_distributable,
      isReserve: isReserveContributionAccount(acc),
      isWpRelevant: !!acc.is_wirtschaftsplan_relevant,
      previousAmount: sumForAccount(acc.id),
    } as PlanZeile;
  });

  // Konvention: Kosten intern negativ, Summen IMMER als Betrag (wie im Dokument).
  const totalPlanned = rows.reduce((s, r) => s + Math.abs(r.planned_amount), 0);
  const distributableTotal = rows.filter((r) => r.isDistributable).reduce((s, r) => s + Math.abs(r.planned_amount), 0);

  // ── Pro Schlüssel-Typ: Σ aller Anteile in der Liegenschaft ────────
  const shareTotals: Record<string, number> = { mea: 0, stellplaetze: 0, einheit: 0, qm: 0, personen: 0 };
  for (const a of (assignmentsRaw as any[])) {
    const isApartment = a.billing_mode !== "distribution_only";
    const area = Number(a.area_sqm_override || 0);
    if (isApartment) {
      shareTotals.einheit += 1;
      if (area > 0) shareTotals.qm += area;
    }
    for (const sh of (a.contact_building_shares || [])) {
      const t = String(sh.share_type || "").toLowerCase();
      const v = Number(sh.share_value) || 0;
      // MEA, Whg.-MEA, Gar.-MEA, Sonder-MEA sind EIGENSTÄNDIGE Verteilerschlüssel.
      if (t === "mea") shareTotals.mea += v;
      else if (t === "stellplaetze") shareTotals.stellplaetze += v;
      else if (t === "personen") shareTotals.personen += v;
      else if (t === "einheit" || t === "einheiten" || t === "qm") { /* über isApartment gezählt */ }
      else if (t) shareTotals[t] = (shareTotals[t] || 0) + v;
    }
  }

  // Anteil eines Eigentümers für einen bestimmten Schlüssel
  const ownerShareValue = (assignmentRaw: any, key: string, ownContactId?: string | null): number => {
    const k = normalizeKey(key);
    if (k === "einheit") return 1;
    if (k === "qm") return Number(assignmentRaw?.area_sqm_override || 0);
    const collectFor = (a: any, types: string[]) =>
      (a?.contact_building_shares || []).filter((sh: any) =>
        types.map((t) => t.toLowerCase()).includes(String(sh.share_type || "").toLowerCase())
      ).reduce((s: number, sh: any) => s + (Number(sh.share_value) || 0), 0);
    // Strikte 1:1-Zuordnung: jeder Schlüssel zählt nur seinen eigenen share_type.
    const types = [k];
    let sum = collectFor(assignmentRaw, types);
    // Nebeneinheiten desselben Eigentümers hinzuaddieren
    if (ownContactId) {
      for (const a of (assignmentsRaw as any[])) {
        if (a.id === assignmentRaw.id) continue;
        if (a.contact_id !== ownContactId) continue;
        if (a?.billing_mode !== "distribution_only") continue;
        sum += collectFor(a, types);
      }
    }
    return sum;
  };

  // ── Eigentümer (Anteile für Sidebar/MEA-Quote) ────────────────────
  const meaTotal = shareTotals.mea || 1;
  const ownerData = assignments.map((a: any) => {
    const c = a.contacts;
    const name = c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "–";
    const meaValue = ownerShareValue(a, "mea", a.contact_id);
    const proportion = meaValue / meaTotal;
    return { id: a.id as string, name, unitNumber: a.unit_number || "–", unitLocation: a.floor_location || "", meaValue, proportion, raw: a };
  });

  // ── Einzelplan-Zeilen: pro Konto den richtigen Schlüssel anwenden ──
  const buildUnitRows = (unitId: string): PlanZeile[] => {
    const ownerEntry = ownerData.find((o) => o.id === unitId);
    if (!ownerEntry) return [];
    const a = ownerEntry.raw;
    return rows.map((r) => {
      const overrideKey = `${unitId}|${r.account_id}`;
      const draftOverride = unitDrafts[overrideKey];
      const dbOverride = (unitItems as any[]).find((u: any) => u.unit_id === unitId && u.account_id === r.account_id);
      const overrideAmount = draftOverride !== undefined ? draftOverride : (dbOverride ? Number(dbOverride.amount) : null);
      const isOverridden = overrideAmount !== null;

      const key = normalizeKey(r.distribution_key);
      const totalShareForKey = key === "heizk_abr"
        ? (heatingTotal > 0 ? heatingTotal : 0)
        : key === "einheit"
          ? (shareTotals.einheit || 1)
          : key === "qm"
            ? (shareTotals.qm || 1)
            : (shareTotals[key] && shareTotals[key] > 0 ? shareTotals[key] : (shareTotals.mea || 1));
      const yourShareValue = key === "heizk_abr"
        ? (heatingByAssignment[unitId] ?? 0)
        : ownerShareValue(a, key, a.contact_id);
      const proportion = key === "heizk_abr"
        ? (heatingTotal > 0 ? yourShareValue / heatingTotal : 0)
        : (totalShareForKey > 0 ? yourShareValue / totalShareForKey : 0);

      const calculated = r.planned_amount * proportion;
      return {
        ...r,
        planned_amount: isOverridden ? overrideAmount! : calculated,
        manually_overridden: isOverridden,
        totalShare: totalShareForKey,
        yourShare: yourShareValue,
        totalAmount: r.planned_amount,
      };
    });
  };

  const periodLabel = `01.01.${fiscalYear} – 31.12.${fiscalYear}`;
  const erstellt = datumDe(opt.heute ?? new Date());

  const buildBaseContext = () => {
    const street = building?.address || "";
    const zipCity = [building?.postal_code, building?.city].filter(Boolean).join(" ") || splitAddress(building?.address || "").zipCity;
    return {
      fiscal_year: fiscalYear,
      period_from: `01.01.${fiscalYear}`,
      period_to: `31.12.${fiscalYear}`,
      periode: periodLabel,
      building_name: building?.name || "",
      building_address: street,
      building_zip_city: zipCity,
      gebaeude_name: building?.name || "",
      gebaeude_adresse: [street, zipCity].filter(Boolean).join(", "),
      plan_status: (plan?.status === "active" ? "Aktiv" : "Entwurf"),
      manager_name: building?.manager_name || "RGI Immobilien",
      manager_phone: "08363 960656",
      manager_email: "info@rgi-immobilien.de",
      created_at: erstellt,
    };
  };

  const sumAbs = (xs: PlanZeile[]) => xs.reduce((s, r) => s + Math.abs(r.planned_amount), 0);

  const buildOverallPlanPayload = () => {
    const distributable = rows.filter((r) => r.isDistributable);
    const reserve = rows.filter((r) => r.isReserve);
    const accountsList = rows.map((r) => ({
      account_number: r.account_number,
      account_name: r.account_name,
      distribution_key_label: distLabel(r.distribution_key),
      previous_amount: fmtEUR(Math.abs(r.previousAmount || 0)),
      planned_amount: fmtEUR(Math.abs(r.planned_amount)),
      change_percent: pctChange(Math.abs(r.planned_amount), Math.abs(r.previousAmount || 0)),
      is_distributable: r.isDistributable ? "ja" : "nein",
      is_reserve: r.isReserve ? "ja" : "nein",
      konto_nr: r.account_number,
      konto_name: r.account_name,
      kategorie: r.category,
      verteilerschluessel: distLabel(r.distribution_key),
      betrag: fmtEUR(Math.abs(r.planned_amount)),
      umlagefaehig: r.isDistributable ? "ja" : "nein",
      ruecklage: r.isReserve ? "ja" : "nein",
    }));
    return {
      ...buildBaseContext(),
      accounts: accountsList,
      total_planned: fmtEUR(sumAbs(rows)),
      total_distributable: fmtEUR(sumAbs(distributable)),
      total_reserve: fmtEUR(sumAbs(reserve)),
      total_area_sqm: "—",
      eur_per_sqm_month: "—",
      konten: accountsList,
      summe_gesamt: fmtEUR(sumAbs(rows)),
      summe_umlagefaehig: fmtEUR(sumAbs(distributable)),
      summe_ruecklage: fmtEUR(sumAbs(reserve)),
    };
  };

  /** Monatliche Gesamtbelastung und Vorschuss eines Eigentümers */
  const monatswerte = (ownerId: string, unitRows: PlanZeile[]) => {
    const monthlyTotal = Math.abs(monthlyTotalOverrides[ownerId] ?? Math.ceil(sumAbs(unitRows.filter((r) => r.isDistributable)) / 12));
    const monthlyAdvance = Math.abs(monthlyAdvanceOverrides[ownerId] ?? monthlyTotal);
    return { monthlyTotal, monthlyAdvance };
  };

  const buildOwnerPlanPayload = (ownerId: string) => {
    const o = ownerData.find((x) => x.id === ownerId);
    const unitRows = buildUnitRows(ownerId);
    const distributable = unitRows.filter((r) => r.isDistributable);
    const reserve = unitRows.filter((r) => r.isReserve);
    const { monthlyTotal, monthlyAdvance } = monatswerte(ownerId, unitRows);
    const fmtShare = (v: any) =>
      v === null || v === undefined || v === "" || Number.isNaN(Number(v))
        ? ""
        : new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
    const accountsList = unitRows.map((r) => ({
      account_number: r.account_number,
      account_name: r.account_name,
      distribution_key_label: distLabel(r.distribution_key),
      total_amount: fmtEUR(Math.abs(r.totalAmount ?? r.planned_amount)),
      owner_amount: fmtEUR(Math.abs(r.planned_amount)),
      owner_share: fmtShare(r.yourShare),
      total_share: fmtShare(r.totalShare),
      your_amount: fmtEUR(Math.abs(r.planned_amount)),
      your_share: fmtShare(r.yourShare),
      is_distributable: r.isDistributable ? "ja" : "nein",
      konto_nr: r.account_number,
      konto_name: r.account_name,
      kategorie: r.category,
      verteilerschluessel: distLabel(r.distribution_key),
      gesamt_betrag: fmtEUR(Math.abs(r.totalAmount ?? r.planned_amount)),
      ihr_anteil: fmtEUR(Math.abs(r.planned_amount)),
      ihr_share: fmtShare(r.yourShare),
      gesamt_share: fmtShare(r.totalShare),
      umlagefaehig: r.isDistributable ? "ja" : "nein",
      ruecklage: r.isReserve ? "ja" : "nein",
    }));
    const ownerAdvanceTotal = Math.abs(monthlyAdvance) * 12;
    const ownerDistributableYear = sumAbs(distributable);
    const ownerReserveYear = sumAbs(reserve);
    const ownerHausgeldYear = ownerAdvanceTotal - ownerReserveYear;
    const monthlyAdvanceAbs = Math.abs(monthlyAdvance);
    const monthlyOwnerTotal = ownerDistributableYear / 12;
    const monthlyReserve = Math.abs(ownerReserveYear / 12);
    const monthlyHausgeld = Math.abs(ownerHausgeldYear / 12);

    return {
      ...buildBaseContext(),
      owner_name: o?.name || "",
      unit_number: o?.unitNumber || "",
      mea: o?.meaValue ?? "",
      accounts: accountsList,
      positions: accountsList,
      total_planned: fmtEUR(sumAbs(unitRows)),
      total_amount_sum: fmtEUR(unitRows.reduce((s, r) => s + Math.abs(r.totalAmount ?? r.planned_amount), 0)),
      summe_gesamt_kosten: fmtEUR(unitRows.reduce((s, r) => s + Math.abs(r.totalAmount ?? r.planned_amount), 0)),
      total_distributable: fmtEUR(ownerDistributableYear),
      owner_total: fmtEUR(ownerDistributableYear),
      owner_reserve_total: fmtEUR(ownerReserveYear),
      owner_advance_total: fmtEUR(ownerAdvanceTotal),
      monthly_advance: fmtEUR(monthlyAdvanceAbs),
      monthly_total: fmtEUR(monthlyTotal),
      owner_total_monthly: fmtEUR(monthlyAdvanceAbs),
      owner_burden_monthly: fmtEUR(monthlyOwnerTotal),
      owner_reserve_monthly: fmtEUR(monthlyReserve),
      owner_advance_monthly: fmtEUR(monthlyAdvanceAbs),
      owner_hausgeld_monthly: fmtEUR(monthlyHausgeld),
      eigentuemer_name: o?.name || "",
      einheit_nr: o?.unitNumber || "",
      einheit_lage: o?.unitLocation || "",
      unit_location: o?.unitLocation || "",
      konten: accountsList,
      summe_gesamt: fmtEUR(sumAbs(unitRows)),
      summe_umlagefaehig: fmtEUR(ownerDistributableYear),
      summe_ruecklage: fmtEUR(ownerReserveYear),
      summe_vorschuss_jahr: fmtEUR(ownerAdvanceTotal),
      monatlicher_vorschuss: fmtEUR(monthlyAdvanceAbs),
      monatliche_gesamtbelastung: fmtEUR(monthlyTotal),
      summe_umlegbar_monat: fmtEUR(monthlyOwnerTotal),
      davon_ruecklage_monat: fmtEUR(monthlyReserve),
      davon_hausgeld_monat: fmtEUR(monthlyHausgeld),
    };
  };

  // Monatliche Vorschüsse je Eigentümer – dieselbe Rechnung wie im Einzelplan
  const hausgeldWerte = ownerData.map((o) => {
    const unitRows = buildUnitRows(o.id);
    const { monthlyAdvance } = monatswerte(o.id, unitRows);
    const ruecklage = Math.abs(sumAbs(unitRows.filter((r) => r.isReserve)) / 12);
    return { assignmentId: o.id, name: o.name, einheit: unitNo(o), monatlich: monthlyAdvance, ruecklage };
  });

  return {
    accounts, rows, totalPlanned, distributableTotal, totalAreaSqm, assignments, shareTotals, ownerData,
    heatingByAssignment, heatingTotal, sumForAccount, ownerShareValue, buildUnitRows, periodLabel,
    buildBaseContext, buildOverallPlanPayload, buildOwnerPlanPayload, hausgeldWerte,
    monthlyTotalOverrides, monthlyAdvanceOverrides,
  };
}

export type Wirtschaftsplan = ReturnType<typeof berechneWirtschaftsplan>;

/** Dateinamen wie in der App (Download/DMS) */
export const wirtschaftsplanDateiname = {
  gesamt: (jahr: number) => `Gesamtwirtschaftsplan_${jahr}`,
  einzel: (jahr: number, o: { name: string; unitNumber?: string }) =>
    `${unitFilePrefix(unitNo(o))}Einzelwirtschaftsplan_${jahr}_${o.name}${unitNo(o) ? `_${unitNo(o)}` : ""}`,
};

/**
 * Server: dieselben Abfragen wie der Editor – aber ohne einen fehlenden Plan anzulegen.
 * db = supabase-js-Client (Service-Rolle).
 */
export async function ladeWirtschaftsplanDaten(db: any, buildingId: string, fiscalYear: number): Promise<WirtschaftsplanDaten> {
  const pruefen = (r: { data: any; error: any }, was: string): any => {
    if (r.error) throw new Error(`${was}: ${r.error.message}`);
    return r.data;
  };
  const [building, plan, allAccounts, accountOverrides, prevYearBookings, assignmentsRaw, prevPeriod] = await Promise.all([
    db.from("buildings").select("name, address, postal_code, city, manager_name").eq("id", buildingId).single().then((r: any) => pruefen(r, "Objekt")),
    db.from("economic_plans").select("*, economic_plan_items(*)").eq("building_id", buildingId).eq("fiscal_year", fiscalYear)
      .order("created_at", { ascending: false }).limit(1).maybeSingle().then((r: any) => pruefen(r, "Wirtschaftsplan")),
    db.from("chart_of_accounts")
      .select("id, account_number, account_name, category, default_distribution_key, settlement_section, is_distributable, is_reserve_funded, reserve_role, is_wirtschaftsplan_relevant")
      .or(`building_id.is.null,building_id.eq.${buildingId}`).order("account_number").then((r: any) => pruefen(r, "Konten")),
    db.from("building_account_overrides").select("account_id, distribution_key").eq("building_id", buildingId).then((r: any) => pruefen(r, "Verteilerschlüssel")),
    ladeBuchungenJahr(db, buildingId, fiscalYear - 1),
    db.from("contact_building_assignments").select(`
          id, unit_number, floor_location, contact_id, unit_kind, billing_mode, parent_assignment_id, area_sqm_override,
          contacts(first_name, last_name, company_name),
          contact_building_shares(share_type, share_value)
        `).eq("building_id", buildingId).eq("is_active", true).in("role_in_building", ["eigentuemer"]).then((r: any) => pruefen(r, "Eigentümer")),
    db.from("billing_periods").select("id").eq("building_id", buildingId).eq("fiscal_year", fiscalYear - 1).maybeSingle().then((r: any) => r.data),
  ]);
  if (!plan) throw new Error(`Für ${fiscalYear} gibt es noch keinen Wirtschaftsplan. Bitte zuerst in der App anlegen.`);
  const heatingPrev = prevPeriod?.id
    ? pruefen(await db.from("heating_distribution_values").select("assignment_id, amount").eq("billing_period_id", prevPeriod.id), "Heizkosten Vorjahr")
    : [];
  const unitItems = pruefen(await db.from("economic_plan_unit_items").select("*").eq("plan_id", plan.id), "Einzelplan-Anpassungen");
  return {
    building, plan, allAccounts: allAccounts ?? [], accountOverrides: accountOverrides ?? [], prevYearBookings: prevYearBookings ?? [],
    heatingPrev: heatingPrev ?? [], assignmentsRaw: assignmentsRaw ?? [], unitItems: unitItems ?? [],
  };
}
