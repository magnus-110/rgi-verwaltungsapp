import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart3, ChevronDown, ChevronRight, Users, PiggyBank, AlertTriangle, Check, FileText, Building2, Loader2, Search, Download, Settings2, FileType } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getEffectiveOpeningBalance, getEffectiveClosingBalance, signedTotalForAccount } from "./lib/bookingAggregation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BillingTemplatesDialog } from "./BillingTemplatesDialog";
import { buildOverallPayload, buildOwnerPayload, type BillingPayloadInputs } from "./lib/buildBillingPayload";

interface BillingSettlementProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

// Mapping Verteilerschlüssel → share_type (in contact_building_shares).
// Identisch zur Liste im Wirtschaftsplan-Editor + Personen-Tab (siehe src/lib/shareTypes.ts).
// Identitäts-Mapping für alle in SHARE_TYPES definierten Keys + Custom-MEA-Varianten,
// damit Custom-Schlüssel (Whg.-MEA, Gar.-MEA, Sonder-MEA, stellplaetze, garagen, ...)
// genau so verteilt werden wie in der Personen-/Anteils-Pflege gespeichert.
const DIST_KEY_TO_SHARE: Record<string, string> = {
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
const getShareType = (distKey: string): string => {
  if (!distKey) return "mea";
  const lower = distKey.toLowerCase();
  return DIST_KEY_TO_SHARE[lower] || DIST_KEY_TO_SHARE[distKey] || distKey;
};

const SHARE_LABELS: Record<string, string> = {
  mea: "Ges.Tausendstel", einheit: "Einheiten", qm: "Wohnfläche (m²)",
  personen: "Personen", wasser: "Wasserverbr.", warmwasser: "Warmwasserverbr.",
  heizkosten: "Heizk.Abr.", direkt: "Direkt",
  garagen: "Garagen", stellplaetze: "Stellplätze",
  "Whg.-MEA": "Whg.-MEA", "Gar.-MEA": "Gar.-MEA", "Sonder-MEA": "Sonder-MEA",
};

const SECTION_LABELS: Record<string, string> = {
  income: "Einnahmen",
  operating_distributable: "Umlagefähige Bewirtschaftungskosten",
  operating_non_distributable: "Nicht umlagefähige Kosten",
  heating: "Heizkosten (nach Brunata)",
  heating_prepayment: "Heizkosten-Vorauszahlungen (Durchlauf)",
  reserve: "Instandhaltungsrücklage",
  reserve_withdrawal: "Entnahme aus Rücklage",
  accrual: "Abgrenzungen (nachrichtlich, nicht verteilt)",
  bank: "Bankkonten",
  opening: "Eröffnungsbuchungen",
};

// Reihenfolge analog HV Office: Einnahmen → Bewirtschaftung → Heizkosten → Rücklage → Abgrenzungen (nachrichtlich).
// 'heating_prepayment' Konten (1431/1440/1470er) sind Durchlaufposten und werden per
// Repost auf 1400 umgebucht — sie erscheinen NICHT in der Abrechnung.
// 'opening' und 'bank' ebenfalls ausgeblendet.
const SECTION_ORDER = ["income", "operating_distributable", "operating_non_distributable", "heating", "reserve", "reserve_withdrawal", "accrual"];

export function BillingSettlement({ buildingId, periodId, fiscalYear }: BillingSettlementProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("total");
  const [busyDownload, setBusyDownload] = useState<string | null>(null); // owner.assignmentId | "overall" | "all"
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedOverallTemplate, setSelectedOverallTemplate] = useState<string | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(SECTION_ORDER));
  const [useIstVorschuss, setUseIstVorschuss] = useState(false);
  const [showZeroBalanceAccounts, setShowZeroBalanceAccounts] = useState(false);

  // Period
  const { data: period } = useQuery({
    queryKey: ["billing-period-settlement", periodId],
    queryFn: async () => {
      const { data, error } = await supabase.from("billing_periods").select("*").eq("id", periodId).single();
      if (error) throw error;
      return data;
    },
  });

  // ALL accounts (not just billing-relevant — we need section-based filtering)
  const { data: accounts = [] } = useQuery({
    queryKey: ["settlement-accounts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // Account overrides
  const { data: overrides = [] } = useQuery({
    queryKey: ["account-overrides", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("building_account_overrides").select("*").eq("building_id", buildingId);
      if (error) throw error;
      return data;
    },
  });

  // All bookings in the period — HV-Office-konform per booking_date filtern
  // (NICHT per fiscal_year, sonst fehlen Buchungen wie die Gas-Rückerstattung
  // 427,68 € vom 18.02.2025 mit fiscal_year=2024).
  const { data: rawBookings = [] } = useQuery({
    queryKey: ["settlement-bookings", buildingId, periodId],
    enabled: !!period,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount, booking_date, booking_type, booking_category, description, is_35a_relevant, fiscal_year")
        .eq("building_id", buildingId)
        .gte("booking_date", period!.period_from)
        .lte("booking_date", period!.period_to)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  // Defense-in-depth: keep bookings that touch a known account on either side
  const validAccountIds = new Set(accounts.map(a => a.id));
  const bookings = rawBookings.filter(b =>
    (!b.account_id && !b.counter_account_id) ||
    (b.account_id && validAccountIds.has(b.account_id)) ||
    (b.counter_account_id && validAccountIds.has(b.counter_account_id))
  );

  // IST-payments on person accounts (for SOLL/IST toggle)
  const { data: istPayments = [] } = useQuery({
    queryKey: ["ist-payments-settlement", buildingId, fiscalYear],
    enabled: useIstVorschuss,
    queryFn: async () => {
      // Get person accounts (account_number starts with 0000)
      const personAccounts = accounts.filter(a => a.account_number.startsWith("0000"));
      if (personAccounts.length === 0) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, amount, counter_account_id, description")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled")
        .in("account_id", personAccounts.map(a => a.id));
      if (error) throw error;
      return data;
    },
  });

  // Owners with shares and costs
  // WICHTIG: Nebeneinheiten (Stellplätze, Keller, …) mit billing_mode='distribution_only'
  // bekommen KEINE eigene Abrechnungszeile. Ihre Shares (MEA, Einheit, qm, …) werden
  // unmittelbar nach dem Laden auf die Hauptwohnung des selben Eigentümers im Building
  // addiert, damit die bestehende Verteilungs-Logik unverändert greift.
  const { data: assignments = [] } = useQuery({
    queryKey: ["owner-assignments-settlement", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`*, contacts(id, first_name, last_name, company_name), contact_building_shares(*), contact_building_costs(*)`)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .in("role_in_building", ["eigentuemer", "mieter"]);
      if (error) throw error;
      const all = (data || []) as any[];

      const isSecondary = (a: any) =>
        a?.billing_mode === "distribution_only" || (a?.unit_kind && a.unit_kind !== "apartment");

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
    },
  });

  // Building (for unit_count / unit_count_for_billing + CSV header)
  const { data: building } = useQuery({
    queryKey: ["settlement-building", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("name, address, building_code, unit_count, unit_count_for_billing")
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Economic plan (for IHR contribution as planned reserve)
  const { data: economicPlan } = useQuery({
    queryKey: ["settlement-economic-plan", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("economic_plans" as any)
        .select("total_reserve")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .maybeSingle();
      if (error) return null;
      return data as any;
    },
  });

  // Account balances
  const { data: balances = [] } = useQuery({
    queryKey: ["account-balances-settlement", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("*, chart_of_accounts(account_number, account_name, category, carry_forward_balance)")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear);
      if (error) throw error;
      return data;
    },
  });

  // Economic plan items for WP column
  const { data: wpItems = [] } = useQuery({
    queryKey: ["wp-items-settlement", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("economic_plan_items" as any)
        .select("account_id, planned_amount")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear);
      if (error) return [];
      return (data as any[]) || [];
    },
  });

  // Heating distribution values
  const { data: heatingDistValues = [] } = useQuery({
    queryKey: ["heating-dist-values-settlement", buildingId, periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heating_distribution_values")
        .select("*")
        .eq("building_id", buildingId)
        .eq("billing_period_id", periodId);
      if (error) return [];
      return data || [];
    },
  });

  // Open invoices
  const { data: openInvoices = [] } = useQuery({
    queryKey: ["open-invoices-settlement", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices" as any)
        .select("id, vendor_name, gross_amount, invoice_date, status")
        .eq("building_id", buildingId)
        .in("status", ["pending", "approved"])
        .order("invoice_date");
      if (error) return [];
      return (data as any[]) || [];
    },
  });

  // --- Computation helpers ---
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  const formatNum = (n: number) =>
    new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(n);

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
    const item = wpItems.find((w: any) => w.account_id === accountId);
    return item ? Number(item.planned_amount) : 0;
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
  // IHR-Zuführung kommt 1:1 aus dem Wirtschaftsplan (Beschluss der ETV).
  // Fallback: Bewegungen auf Konto „reserve" (z. B. wenn noch kein WP existiert).
  const reserveFromBookings = getSectionTotal("reserve");
  const totalReserve = economicPlan?.total_reserve != null ? Number(economicPlan.total_reserve) : reserveFromBookings;
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
  const carryAccounts = accounts.filter((a: any) => a.carry_forward_balance);
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
    a.account_number === "1810" || a.account_number === "1820";
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
  const openingTotal = openingGiro + openingReserve + openingFuel + openingPrepay + openingOther;

  // Closing balances — automatisch via Helper, manueller closing_balance als Override
  const getClosing = (acc: any) => {
    const manual = balances.find((b: any) => b.account_id === acc.id);
    if (manual && manual.closing_balance !== null && manual.closing_balance !== undefined && Number(manual.closing_balance) !== 0) {
      return Number(manual.closing_balance);
    }
    return closingByAccount[acc.id] || 0;
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
  const closingTotal = closingGiro + closingReserve + closingFuel + closingPrepay + closingOther;

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
  // Abgrenzungen (totalAccrual) sind jahresübergreifend und werden NICHT verteilt,
  // sondern nur nachrichtlich ausgewiesen. Sie fließen daher nicht in die Spitze.
  const abrechnungssumme = totalOperatingDist + totalOperatingNonDist + totalReserve - totalReserveWithdrawal;

  // Helper: calculate overlap months between a cost's validity and the billing period
  function getCostAnnualAmount(cost: any, periodFrom: string, periodTo: string) {
    const pStart = new Date(periodFrom);
    const pEnd = new Date(periodTo);
    const cStart = cost.valid_from ? new Date(cost.valid_from) : pStart;
    const cEnd = cost.valid_to ? new Date(cost.valid_to) : pEnd;
    const effStart = cStart > pStart ? cStart : pStart;
    const effEnd = cEnd < pEnd ? cEnd : pEnd;
    if (effStart > effEnd) return 0;
    // Calculate months overlap (day-precise)
    const totalPeriodDays = (pEnd.getTime() - pStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
    const overlapDays = (effEnd.getTime() - effStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
    const overlapMonths = (overlapDays / totalPeriodDays) * 12;
    const amount = Number(cost.amount);
    switch (cost.interval) {
      case "monatlich": return amount * overlapMonths;
      case "quartal": return amount * (overlapMonths / 3);
      case "jaehrlich": return amount * (overlapMonths / 12);
      default: return amount * overlapMonths;
    }
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
      const isHausgeld = ["hausgeld", "nebenkosten"].includes(ct);
      const isReserve = ct === "ruecklage";
      let annual = 0;
      if (period) {
        const pStart = new Date(period.period_from);
        const pEnd = new Date(period.period_to);
        const aStart = a.valid_from ? new Date(a.valid_from) : pStart;
        const aEnd = a.valid_to ? new Date(a.valid_to) : pEnd;
        const cStart = c.valid_from ? new Date(c.valid_from) : pStart;
        const cEnd = c.valid_to ? new Date(c.valid_to) : pEnd;
        const effStart = new Date(Math.max(pStart.getTime(), aStart.getTime(), cStart.getTime()));
        const effEnd = new Date(Math.min(pEnd.getTime(), aEnd.getTime(), cEnd.getTime()));
        if (effEnd >= effStart) {
          const totalPeriodDays = (pEnd.getTime() - pStart.getTime()) / 86400000 + 1;
          const overlapDays = (effEnd.getTime() - effStart.getTime()) / 86400000 + 1;
          const overlapMonths = (overlapDays / totalPeriodDays) * 12;
          const amount = Number(c.amount);
          switch (c.interval) {
            case "monatlich": annual = amount * overlapMonths; break;
            case "quartal": annual = amount * (overlapMonths / 3); break;
            case "jaehrlich": annual = amount * (overlapMonths / 12); break;
            default: annual = amount * overlapMonths;
          }
        }
      } else {
        const amount = Number(c.amount);
        switch (c.interval) {
          case "monatlich": annual = amount * 12; break;
          case "quartal": annual = amount * 4; break;
          case "jaehrlich": annual = amount; break;
          default: annual = amount * 12;
        }
      }
      if (isHausgeld || isReserve) sollHausgeldGesamt += annual;
      else sollHausgeldGesamt += annual;
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
  // Saldo (Gegenkonto-Vorzeichen). Für die Überzahlungs-Logik invertieren wir,
  // damit "tatsächlich gezahlt" als positiver Betrag vorliegt.
  const personenkontenClose = personenkontenAccounts.reduce((s: number, a: any) => {
    return s + getEffectiveClosingBalance(a.id, bookings as any[], flatBalances, fiscalYear, opening4000Id).amount;
  }, 0);
  const personenkontenPaid = -personenkontenClose;

  const totalSollEHR = ehrAccountClosing;
  const totalSollKostendeckung = Math.max(0, sollHausgeldGesamt - totalSollEHR);
  const totalUeberzahlung = personenkontenPaid - totalSollKostendeckung - totalSollEHR;
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

  const abrechnungsspitze = totalVorschuss - abrechnungssumme;

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
    const distributableAccounts = accounts.filter((a) => a.is_distributable && !isAccrualBalanceAccount(a));
    distributableAccounts.forEach((acc) => {
      // IHR-Zuführung (reserve section): nimm WP-Wert 1:1 statt Buchungs-Summe
      const isReserveAcc = acc.settlement_section === "reserve";
      const total = isReserveAcc && economicPlan?.total_reserve != null
        ? Number(economicPlan.total_reserve)
        : getAccountAbsTotal(acc.id);
      if (total === 0) return;

      const distKey = getDistKey(acc.id, acc.default_distribution_key);
      const shareType = getShareType(distKey);

      // Heizkosten-Konten (z. B. 1400) — strikt Brunata-Werte, KEIN MEA-Fallback.
      // Fehlen Brunata-Werte, wird 0 verteilt (Warnung wird in der UI angezeigt).
      const isHeatingAccount = acc.is_heating_relevant === true;
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
        // Verwalter & Co.: 1 Einheit = 1 Anteil. Override via buildings.unit_count_for_billing möglich.
        const totalUnits = building?.unit_count_for_billing ?? building?.unit_count ?? assignments.length;
        totalSharesValue = totalUnits;
        ownerShareValue = 1;
        ownerCost = totalUnits > 0 ? (total / totalUnits) * timeProp : 0;
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
        // Fallback to SOLL
        hausgeld = costs
          .filter((c: any) => ["hausgeld", "nebenkosten"].includes((c.cost_type || "").toLowerCase()))
          .reduce((s: number, c: any) => {
            if (period) return s + getCostAnnualAmount(c, period.period_from, period.period_to);
            const a = Number(c.amount);
            switch (c.interval) {
              case "monatlich": return s + a * 12;
              case "quartal": return s + a * 4;
              case "jaehrlich": return s + a;
              default: return s + a * 12;
            }
          }, 0) * timeProp;
        reserve = costs
          .filter((c: any) => (c.cost_type || "").toLowerCase() === "ruecklage")
          .reduce((s: number, c: any) => {
            if (period) return s + getCostAnnualAmount(c, period.period_from, period.period_to);
            const a = Number(c.amount);
            switch (c.interval) {
              case "monatlich": return s + a * 12;
              case "quartal": return s + a * 4;
              case "jaehrlich": return s + a;
              default: return s + a * 12;
            }
          }, 0) * timeProp;
      }
    } else {
      // SOLL: from contact_building_costs
      hausgeld = costs
        .filter((c: any) => ["hausgeld", "nebenkosten"].includes((c.cost_type || "").toLowerCase()))
        .reduce((s: number, c: any) => {
          if (period) return s + getCostAnnualAmount(c, period.period_from, period.period_to);
          const a = Number(c.amount);
          switch (c.interval) {
            case "monatlich": return s + a * 12;
            case "quartal": return s + a * 4;
            case "jaehrlich": return s + a;
            default: return s + a * 12;
          }
        }, 0) * timeProp;
      reserve = costs
        .filter((c: any) => (c.cost_type || "").toLowerCase() === "ruecklage")
        .reduce((s: number, c: any) => {
          if (period) return s + getCostAnnualAmount(c, period.period_from, period.period_to);
          const a = Number(c.amount);
          switch (c.interval) {
            case "monatlich": return s + a * 12;
            case "quartal": return s + a * 4;
            case "jaehrlich": return s + a;
            default: return s + a * 12;
          }
        }, 0) * timeProp;
    }

    const totalPaid = hausgeld + reserve;
    const result = totalPaid - totalOwnerCost;

    return {
      assignmentId: assignment.id,
      contactId: contact?.id,
      name,
      unitNumber: assignment.unit_number || "–",
      totalOwnerCost,
      hausgeld,
      reserve,
      totalPaid,
      result,
      timeProp,
      owner35aDienste,
      owner35aHandwerker,
      accountBreakdown,
    };
  };

  const ownerResults = assignments.map(computeOwnerResult);
  const filteredOwners = ownerResults.filter(o =>
    !ownerSearch || o.name.toLowerCase().includes(ownerSearch.toLowerCase()) || o.unitNumber.includes(ownerSearch)
  );

  const totalPaidAll = ownerResults.reduce((s, o) => s + o.totalPaid, 0);
  const totalShareAll = ownerResults.reduce((s, o) => s + o.totalOwnerCost, 0);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  // ============================================================
  //  Vorlagen-basierter Export — neu (DOCX/PDF via generate-billing-document)
  //  Quelle der Wahrheit: ausschließlich UI-Werte aus diesem Component.
  // ============================================================
  const { data: billingTemplates = [] } = useQuery({
    queryKey: ["billing-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("billing_templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
  const singleTemplates = billingTemplates.filter((t: any) => t.scope === "single");
  const overallTemplates = billingTemplates.filter((t: any) => t.scope === "overall");
  const effectiveSingleTpl = selectedTemplate || singleTemplates[0]?.id || null;
  const effectiveOverallTpl = selectedOverallTemplate || overallTemplates[0]?.id || effectiveSingleTpl;

  const sanitizeFilename = (s: string) =>
    s.replace(/[^a-zA-Z0-9äöüÄÖÜß_\-]+/g, "_").replace(/^_+|_+$/g, "");

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

  const triggerDownload = (bytes: ArrayBuffer | Uint8Array | Blob, filename: string, mime: string) => {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBilling = async (
    target: "overall" | "owner" | "all",
    format: "docx" | "pdf",
    owner?: { assignmentId: string; name: string },
  ) => {
    const tplId = target === "overall" ? effectiveOverallTpl : effectiveSingleTpl;
    if (!tplId) {
      toast.error("Bitte zuerst eine Vorlage hochladen (Vorlagen-Verwaltung).");
      setTemplatesOpen(true);
      return;
    }
    const busyKey = target === "owner" ? owner!.assignmentId : target;
    setBusyDownload(busyKey);
    try {
      const inp = buildPayloadInputs();
      let items: Array<{ kind: "owner" | "overall"; ownerId?: string; ownerName?: string; payload: any }> = [];
      if (target === "overall") {
        items = [{ kind: "overall", payload: buildOverallPayload(inp) }];
      } else if (target === "owner") {
        items = [{ kind: "owner", ownerId: owner!.assignmentId, ownerName: owner!.name, payload: buildOwnerPayload(inp, owner!.assignmentId) }];
      } else {
        items = [
          { kind: "overall", payload: buildOverallPayload(inp) },
          ...ownerResults.map((o) => ({ kind: "owner" as const, ownerId: o.assignmentId, ownerName: o.name, payload: buildOwnerPayload(inp, o.assignmentId) })),
        ];
      }
      const mode = target === "all" ? "all" : "single";
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Bitte erneut anmelden, um die Abrechnung herunterzuladen.");

      // Wichtig: nicht supabase.functions.invoke() für DOCX/ZIP nutzen.
      // Der Supabase-Client decodiert Office-Binaries teilweise als Text und beschädigt dadurch die ZIP-Struktur.
      const resp = await fetch(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/generate-billing-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          template_id: tplId,
          overall_template_id: effectiveOverallTpl,
          fiscal_year: fiscalYear,
          mode,
          format,
          file_prefix: `Abrechnung_${fiscalYear}`,
          items,
        }),
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || `Export fehlgeschlagen (${resp.status})`);
      }
      const bytes = await resp.blob();
      const ext = target === "all" ? "zip" : format;
      const mime =
        target === "all"
          ? "application/zip"
          : format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const fname =
        target === "owner"
          ? `Einzelabrechnung_${sanitizeFilename(owner!.name)}_${fiscalYear}.${ext}`
          : target === "overall"
            ? `Gesamtabrechnung_${fiscalYear}.${ext}`
            : `Abrechnung_${fiscalYear}.${ext}`;
      triggerDownload(bytes, fname, mime);
      toast.success("Download bereit");
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message || "Unbekannt"));
    } finally {
      setBusyDownload(null);
    }
  };


  // ============================================================
  //  Verteilerschlüssel-Warnungen — meldet Konten, die nicht
  //  korrekt verteilt werden können (fehlende Stammdaten).
  // ============================================================
  type DistWarning = {
    accountNumber: string;
    accountName: string;
    amount: number;
    distributionKey: string;
    reason: string;
  };

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
      const total = isReserveAcc && economicPlan?.total_reserve != null
        ? Number(economicPlan.total_reserve)
        : getAccountBookingTotal(acc.id);
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






  // --- Render helper for Gesamtabrechnung section ---
  const renderSection = (section: string) => {
    const accs = sectionAccounts[section] || [];
    if (accs.length === 0 && section !== "reserve") return null;
    const signedTotal = getSectionSignedTotal(section);
    const wpTotal = accs.reduce((s, a) => s + a.wpAmount, 0);
    // Verteilungsrelevante Summe nutzt Magnitude (Kostensumme zur Verteilung)
    const distTotal = accs.filter(a => a.is_distributable).reduce((s, a) => s + a.totalAbs, 0);
    const isExpanded = expandedSections.has(section);
    const isIncomeSection = section === "income";

    // Vorzeichen-Konvention für die Anzeige:
    //  - Einnahmen-Sektion → positive Werte mit "+"
    //  - Aufwands-Sektionen (Bewirtschaftung, Heizung, Rücklage, Abgrenzung) → mit "−"
    const isExpenseSection = section !== "income";
    const renderSigned = (n: number) => {
      const v = Math.round(n * 100) / 100;
      if (v === 0) return <span className="font-mono">{formatCurrency(0)}</span>;
      const displayPositive = isExpenseSection ? false : v > 0;
      return (
        <span className={cn("font-mono", displayPositive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
          {displayPositive ? "+" : "−"}{formatCurrency(Math.abs(v))}
        </span>
      );
    };

    return (
      <Collapsible key={section} open={isExpanded} onOpenChange={() => toggleSection(section)}>
        <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted text-left">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium text-sm">{SECTION_LABELS[section] || section}</span>
            <Badge variant="outline" className="text-xs">{accs.length}</Badge>
          </div>
          <div className="flex gap-4 text-sm">
            {wpTotal > 0 && <span className="font-mono text-muted-foreground">{formatCurrency(wpTotal)}</span>}
            <span className="font-medium">{renderSigned(signedTotal)}</span>
            {distTotal > 0 && Math.abs(distTotal - Math.abs(signedTotal)) > 0.005 && (
              <span className="font-mono text-muted-foreground">{formatCurrency(distTotal)}</span>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Konto</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right w-[120px]">Wirtschaftsplan</TableHead>
                <TableHead className="text-right w-[140px]">Einnahme/Ausgabe</TableHead>
                <TableHead className="text-right w-[120px]">Verteilungsrel.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accs.map(acc => (
                <TableRow key={acc.id}>
                  <TableCell className="font-mono text-xs">{acc.account_number}</TableCell>
                  <TableCell className="text-sm">{acc.account_name}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                    {acc.wpAmount > 0 ? formatCurrency(acc.wpAmount) : "–"}
                  </TableCell>
                  <TableCell className="text-right text-sm">{renderSigned(acc.total)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {acc.is_distributable ? formatCurrency(acc.totalAbs) : "–"}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/30">
                <TableCell colSpan={2} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Abschnittsaldo {SECTION_LABELS[section] || section}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold text-muted-foreground">
                  {wpTotal > 0 ? formatCurrency(wpTotal) : "–"}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold">{renderSigned(signedTotal)}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold">
                  {distTotal > 0 ? formatCurrency(distTotal) : "–"}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const selectedOwnerData = selectedOwner ? ownerResults.find(o => o.assignmentId === selectedOwner) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Gesamtabrechnung {fiscalYear}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {accounts.filter(a => a.settlement_section).length} Konten in Abrechnungsstruktur
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busyDownload === "overall"}>
                {busyDownload === "overall" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Gesamtabrechnung herunterladen
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadBilling("overall", "docx")}>
                <FileType className="h-4 w-4 mr-2" /> DOCX
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadBilling("overall", "pdf")}>
                <FileText className="h-4 w-4 mr-2" /> PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTemplatesOpen(true)}>
                <Settings2 className="h-4 w-4 mr-2" /> Vorlagen verwalten
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="underline" className="mb-4 flex-wrap h-auto">
            <TabsTrigger variant="underline" value="total">Gesamtabrechnung</TabsTrigger>
            <TabsTrigger variant="underline" value="owners">
              <Users className="h-4 w-4 mr-1" /> Einzelabrechnungen ({ownerResults.length})
            </TabsTrigger>
            <TabsTrigger variant="underline" value="assets">
              <Building2 className="h-4 w-4 mr-1" /> Vermögensbericht
            </TabsTrigger>
          </TabsList>

          {/* ===== TAB 1: GESAMTABRECHNUNG ===== */}
          <TabsContent value="total" className="space-y-3">
            <div className="flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground">Null-Saldo Konten anzeigen</span>
              <Switch checked={showZeroBalanceAccounts} onCheckedChange={setShowZeroBalanceAccounts} />
            </div>
            {distributionWarnings.length > 0 && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/5 text-foreground">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  Verteilung unvollständig — {distributionWarnings.length}{" "}
                  {distributionWarnings.length === 1 ? "Konto wird" : "Konten werden"} nicht verteilt
                </AlertTitle>
                <AlertDescription className="mt-2">
                  <ul className="space-y-1 text-sm">
                    {distributionWarnings.map((w) => (
                      <li key={w.accountNumber}>
                        <span className="font-mono">{w.accountNumber}</span>{" "}
                        <span className="font-medium">{w.accountName}</span>{" "}
                        <span className="text-muted-foreground">({formatCurrency(w.amount)})</span>
                        {" — "}
                        {w.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    → Verteilerschlüssel im Kontenrahmen oder per Building-Override anpassen, dann Abrechnung neu laden.
                  </p>
                </AlertDescription>
              </Alert>
            )}
            {/* Anfangsbestände */}
            <div className="p-3 rounded-lg bg-muted/30 space-y-1">
              <div className="text-sm font-medium mb-1">Anfangsbestände zum {period ? new Date(period.period_from).toLocaleDateString("de-DE") : "–"}</div>
              <div className="flex justify-between text-sm">
                <span>Girokonto</span>
                <span className="font-mono">{formatCurrency(Math.abs(openingGiro))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Instandhaltungsrücklage</span>
                <span className="font-mono">{formatCurrency(Math.abs(openingReserve))}</span>
              </div>
              {openingFuel !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Brennstoffanfangsbestand (Heizöl)</span>
                  <span className="font-mono">{formatCurrency(Math.abs(openingFuel))}</span>
                </div>
              )}
              {openingPrepay !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Vorauszahlungen Versorger (1470–1473)</span>
                  <span className="font-mono">{formatCurrency(openingPrepay)}</span>
                </div>
              )}
              {openingOther !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Sonstige Bestandskonten</span>
                  <span className="font-mono">{formatCurrency(openingOther)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium border-t pt-1">
                <span>Gesamt</span>
                <span className="font-mono">{formatCurrency(Math.abs(openingGiro) + Math.abs(openingReserve) + Math.abs(openingFuel) + openingPrepay + openingOther)}</span>
              </div>
            </div>

            {/* Einnahmen-Hochrechnung (HV-Office-Stil) — Soll aus Stammdaten + Zinsen aus Buchungen */}
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 space-y-1">
              <div className="text-sm font-medium mb-1">Einnahmen (Soll-Hochrechnung)</div>
              <div className="flex justify-between text-sm">
                <span>Vorschüsse zur Kostendeckung</span>
                <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(totalSollKostendeckung)}</span>
              </div>
              {hasReserveSplit && (
                <div className="flex justify-between text-sm">
                  <span>Vorschüsse auf Erhaltungsrücklage</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(totalSollEHR)}</span>
                </div>
              )}
              {Math.abs(totalUeberzahlung) > 0.005 && (
                <div className="flex justify-between text-sm">
                  <span>Überzahlung Vorschüsse</span>
                  <span className={`font-mono ${totalUeberzahlung >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    {totalUeberzahlung >= 0 ? "+" : ""}{formatCurrency(totalUeberzahlung)}
                  </span>
                </div>
              )}
              {incomeAccountTotals.interest > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Zinseinnahmen (lt. Buchungen)</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(incomeAccountTotals.interest)}</span>
                </div>
              )}
              {incomeAccountTotals.other > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Sonstige Erträge (lt. Buchungen)</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(incomeAccountTotals.other)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium border-t border-emerald-200 dark:border-emerald-900 pt-1">
                <span>Zwischensumme Einnahmen</span>
                <span className="font-mono text-emerald-700 dark:text-emerald-400">+{formatCurrency(totalEinnahmen)}</span>
              </div>
            </div>

            {/* Sections — Income wird oben im Soll-Hochrechnungsblock dargestellt → hier ausblenden */}
            {SECTION_ORDER.filter(s => s !== "income" && s !== "reserve").map(section => renderSection(section))}

            {/* Abrechnungssumme */}
            <div className="space-y-2 mt-4">
              <div className="flex justify-between p-3 rounded-lg bg-muted/30 text-sm">
                <span>Abrechnungssumme (Gesamtkosten)</span>
                <span className="font-mono font-medium">{formatCurrency(abrechnungssumme)}</span>
              </div>
              <div className="flex justify-between p-3 rounded-lg bg-muted/30 text-sm">
                <span>Vorschussverpflichtung (Hausgeld + IHR)</span>
                <span className="font-mono font-medium">{formatCurrency(totalVorschuss)}</span>
              </div>
              <div className={`flex justify-between p-3 rounded-lg border-2 text-sm font-semibold ${
                abrechnungsspitze >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
              }`}>
                <span>Abrechnungsspitze ({abrechnungsspitze >= 0 ? "Guthaben" : "Nachzahlung"})</span>
                <span className="font-mono">{formatCurrency(Math.abs(abrechnungsspitze))}</span>
              </div>
            </div>

            {/* Kontrolle Endbestände */}
            <div className="p-3 rounded-lg bg-muted/30 space-y-1 mt-2">
              <div className="text-sm font-medium mb-1">Kontrolle Endbestände zum {period ? new Date(period.period_to).toLocaleDateString("de-DE") : "–"}</div>
              <div className="flex justify-between text-sm">
                <span>Girokonto</span>
                <span className="font-mono">{formatCurrency(Math.abs(closingGiro))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Instandhaltungsrücklage</span>
                <span className="font-mono">{formatCurrency(Math.abs(closingReserve))}</span>
              </div>
              {closingFuel !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Brennstoffendbestand (Heizöl)</span>
                  <span className="font-mono">{formatCurrency(Math.abs(closingFuel))}</span>
                </div>
              )}
              {closingPrepay !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Vorauszahlungen Versorger (1470–1473)</span>
                  <span className="font-mono">{formatCurrency(closingPrepay)}</span>
                </div>
              )}
              {closingOther !== 0 && (
                <div className="flex justify-between text-sm">
                  <span>Sonstige Bestandskonten</span>
                  <span className="font-mono">{formatCurrency(closingOther)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-medium border-t pt-1">
                <span>Gesamt</span>
                <span className="font-mono">{formatCurrency(Math.abs(closingGiro) + Math.abs(closingReserve) + Math.abs(closingFuel) + closingPrepay + closingOther)}</span>
              </div>
            </div>

          </TabsContent>

          {/* ===== TAB 2: EINZELABRECHNUNGEN ===== */}
          <TabsContent value="owners">
            {/* SOLL/IST Toggle */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/30">
              <span className="text-sm text-muted-foreground">Vorschüsse aus:</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${!useIstVorschuss ? "text-foreground" : "text-muted-foreground"}`}>SOLL</span>
                <Switch checked={useIstVorschuss} onCheckedChange={setUseIstVorschuss} />
                <span className={`text-sm font-medium ${useIstVorschuss ? "text-foreground" : "text-muted-foreground"}`}>IST</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {useIstVorschuss ? "Tatsächliche Zahlungen aus Personenkonten" : "Geplante Beträge aus Kostenzuordnung"}
              </span>
            </div>
            {ownerResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Keine Eigentümer mit aktiven Zuordnungen gefunden.
              </p>
            ) : selectedOwnerData ? (
              // Detail view for selected owner
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedOwner(null)} className="mb-1">
                      ← Zurück zur Übersicht
                    </Button>
                    <h3 className="text-lg font-semibold">{selectedOwnerData.name} — Einheit {selectedOwnerData.unitNumber}</h3>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => downloadBilling("owner", "docx", { assignmentId: selectedOwnerData.assignmentId, name: selectedOwnerData.name })} disabled={busyDownload === selectedOwnerData.assignmentId}>
                    {busyDownload === selectedOwnerData.assignmentId ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />} DOCX
                  </Button>
                </div>

                {/* 7-column detail table — gruppiert nach displaySection (HV-Office-konform) */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[70px]">Konto</TableHead>
                        <TableHead>Bezeichnung</TableHead>
                        <TableHead className="text-right w-[100px]">Verteilungsrel.</TableHead>
                        <TableHead className="w-[100px]">Verteiler</TableHead>
                        <TableHead className="text-right w-[80px]">Gesamt</TableHead>
                        <TableHead className="text-right w-[80px]">Ihr Anteil</TableHead>
                        <TableHead className="text-right w-[100px]">Ihre Kosten</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        // Gruppieren nach displaySection — Reihenfolge wie in der Gesamtabrechnung
                        const groupOrder = ["operating_distributable", "operating_non_distributable", "heating", "reserve"];
                        const groups = groupOrder
                          .map((sec) => ({
                            sec,
                            label: SECTION_LABELS[sec] || sec,
                            rows: selectedOwnerData.accountBreakdown.filter((r) => r.displaySection === sec),
                          }))
                          .filter((g) => g.rows.length > 0);

                        return groups.flatMap((g) => {
                          const subtotal = g.rows.reduce((s, r) => s + r.ownerCost, 0);
                          return [
                            <TableRow key={`hdr-${g.sec}`} className="bg-muted/40">
                              <TableCell colSpan={7} className="font-semibold text-xs uppercase tracking-wide">
                                {g.label}
                              </TableCell>
                            </TableRow>,
                            ...g.rows.map((row, i) => (
                              <TableRow key={`${g.sec}-${i}`}>
                                <TableCell className="font-mono text-xs">{row.accountNumber}</TableCell>
                                <TableCell className="text-sm">
                                  {row.signedFactor < 0 ? `./. ${row.accountName} (aus Rücklage)` : row.accountName}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">{formatCurrency(row.distributableAmount)}</TableCell>
                                <TableCell className="text-xs">{row.distKey}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatNum(row.totalShares)}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{formatNum(row.ownerShare)}</TableCell>
                                <TableCell className={cn(
                                  "text-right font-mono text-sm font-medium",
                                  row.ownerCost < 0 && "text-emerald-600 dark:text-emerald-400"
                                )}>
                                  {row.ownerCost < 0 ? "−" : ""}{formatCurrency(Math.abs(row.ownerCost))}
                                </TableCell>
                              </TableRow>
                            )),
                            <TableRow key={`sub-${g.sec}`} className="border-t">
                              <TableCell colSpan={6} className="text-xs text-muted-foreground">Zwischensumme {g.label}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {subtotal < 0 ? "−" : ""}{formatCurrency(Math.abs(subtotal))}
                              </TableCell>
                            </TableRow>,
                          ];
                        });
                      })()}
                      <TableRow className="font-medium border-t-2">
                        <TableCell colSpan={6}>Abrechnungssumme</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(selectedOwnerData.totalOwnerCost)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={6} className="text-sm">Vorschussverpflichtung (Hausgeld + IHR)</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(selectedOwnerData.totalPaid)}</TableCell>
                      </TableRow>
                      <TableRow className={`font-semibold ${selectedOwnerData.result >= 0 ? "text-green-700" : "text-red-700"}`}>
                        <TableCell colSpan={6}>
                          Abrechnungsspitze ({selectedOwnerData.result >= 0 ? "Guthaben" : "Nachzahlung"})
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Math.abs(selectedOwnerData.result))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                {/* §35a */}
                {(selectedOwnerData.owner35aDienste > 0 || selectedOwnerData.owner35aHandwerker > 0) && (
                  <Card className="border-dashed">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">§35a EStG Bescheinigung</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2 text-sm">
                      {selectedOwnerData.owner35aDienste > 0 && (
                        <div className="flex justify-between">
                          <span>Haushaltsnahe Dienstleistungen (20%, max. 4.000€)</span>
                          <span className="font-mono">{formatCurrency(selectedOwnerData.owner35aDienste)}</span>
                        </div>
                      )}
                      {selectedOwnerData.owner35aHandwerker > 0 && (
                        <div className="flex justify-between">
                          <span>Handwerkerleistungen (20%, max. 1.200€)</span>
                          <span className="font-mono">{formatCurrency(selectedOwnerData.owner35aHandwerker)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium border-t pt-1">
                        <span>Steuerbonus</span>
                        <span className="font-mono">
                          {formatCurrency(
                            Math.min(selectedOwnerData.owner35aDienste * 0.2, 4000) +
                            Math.min(selectedOwnerData.owner35aHandwerker * 0.2, 1200)
                          )}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              // Owner list view
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="outline">
                    <PiggyBank className="h-3 w-3 mr-1" /> Vorschüsse: {formatCurrency(totalPaidAll)}
                  </Badge>
                  <Badge variant="outline">Kosten: {formatCurrency(totalShareAll)}</Badge>
                  {Math.abs(totalPaidAll - totalShareAll) > 0.01 && (
                    <Badge className={totalPaidAll > totalShareAll ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                      {totalPaidAll > totalShareAll ? "Guthaben" : "Nachzahlung"}: {formatCurrency(Math.abs(totalPaidAll - totalShareAll))}
                    </Badge>
                  )}
                </div>

                {ownerResults.length > 10 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Eigentümer suchen..." value={ownerSearch} onChange={e => setOwnerSearch(e.target.value)} className="pl-9" />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Einheit</TableHead>
                        <TableHead>Eigentümer</TableHead>
                        <TableHead className="text-right">Kostenanteil</TableHead>
                        <TableHead className="text-right">Vorschüsse</TableHead>
                        <TableHead className="text-right">Ergebnis</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOwners.map(owner => (
                        <TableRow key={owner.assignmentId} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedOwner(owner.assignmentId)}>
                          <TableCell className="text-sm font-medium">
                            {owner.unitNumber}
                            {owner.timeProp < 1 && (
                              <Badge variant="outline" className="ml-1 text-[10px]">
                                {Math.round(owner.timeProp * 100)}%
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{owner.name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(owner.totalOwnerCost)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(owner.totalPaid)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {owner.result >= 0 ? (
                              <span className="text-green-700 flex items-center justify-end gap-1">
                                <Check className="h-3 w-3" /> {formatCurrency(owner.result)}
                              </span>
                            ) : (
                              <span className="text-red-700 flex items-center justify-end gap-1">
                                <AlertTriangle className="h-3 w-3" /> {formatCurrency(owner.result)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-7 px-2"
                              onClick={(e) => { e.stopPropagation(); downloadBilling("owner", "docx", { assignmentId: owner.assignmentId, name: owner.name }); }}
                              disabled={busyDownload === owner.assignmentId} title="DOCX herunterladen">
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-medium border-t-2">
                        <TableCell></TableCell>
                        <TableCell>Gesamt</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(totalShareAll)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(totalPaidAll)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(ownerResults.reduce((s, o) => s + o.result, 0))}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ===== TAB 3: VERMÖGENSBERICHT ===== */}
          <TabsContent value="assets" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Gemäß §28 WEG — Vermögenslage zum Ende des Abrechnungszeitraums {fiscalYear}.
            </p>

            {/* Bankkonten */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Bankkonten & Liquidität</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {balances.filter((b: any) => b.chart_of_accounts?.carry_forward_balance).length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Konto</TableHead>
                        <TableHead>Bezeichnung</TableHead>
                        <TableHead className="text-right">Anfangsbestand</TableHead>
                        <TableHead className="text-right">Endbestand</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balances.filter((b: any) => b.chart_of_accounts?.carry_forward_balance).map((b: any) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-xs">{b.chart_of_accounts?.account_number}</TableCell>
                          <TableCell className="text-sm">{b.chart_of_accounts?.account_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(Number(b.opening_balance))}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(Number(b.closing_balance))}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-medium border-t-2">
                        <TableCell colSpan={2}>Gesamtliquidität</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(openingTotal)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(closingTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Keine Kontensalden erfasst.</p>
                )}
              </CardContent>
            </Card>

            {/* Rücklagenentwicklung */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Rücklagenentwicklung</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {balances.filter((b: any) => b.chart_of_accounts?.category === "ruecklage").map((b: any) => (
                  <div key={b.id} className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Anfangsbestand</span>
                      <span className="font-mono">{formatCurrency(Number(b.opening_balance))}</span>
                    </div>
                    <div className="flex justify-between text-green-700">
                      <span>+ Zuführungen (Plan)</span>
                      <span className="font-mono">{formatCurrency(totalReserve)}</span>
                    </div>
                    {totalReserveWithdrawal > 0 && (
                      <div className="flex justify-between text-red-700">
                        <span>- Entnahmen</span>
                        <span className="font-mono">{formatCurrency(totalReserveWithdrawal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Endbestand</span>
                      <span className="font-mono">{formatCurrency(Number(b.closing_balance))}</span>
                    </div>
                  </div>
                ))}
                {balances.filter((b: any) => b.chart_of_accounts?.category === "ruecklage").length === 0 && (
                  <p className="text-sm text-muted-foreground py-2 text-center">Keine Rücklagenkonten gefunden.</p>
                )}
              </CardContent>
            </Card>

            {/* Offene Verbindlichkeiten */}
            {openInvoices.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Offene Verbindlichkeiten</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lieferant</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead className="text-right">Betrag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openInvoices.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="text-sm">{inv.vendor_name || "–"}</TableCell>
                          <TableCell className="text-sm">{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString("de-DE") : "–"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(Number(inv.gross_amount || 0))}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-medium border-t-2">
                        <TableCell colSpan={2}>Gesamt</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(openInvoices.reduce((s: number, i: any) => s + Number(i.gross_amount || 0), 0))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Zusammenfassung */}
            <Card className="border-2 border-primary/20">
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Bankkonten</span>
                  <span className="font-mono font-medium">{formatCurrency(closingTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>davon Rücklagen</span>
                  <span className="font-mono text-muted-foreground">{formatCurrency(closingReserve)}</span>
                </div>
                {openInvoices.length > 0 && (
                  <div className="flex justify-between text-red-700">
                    <span>./. offene Verbindlichkeiten</span>
                    <span className="font-mono">{formatCurrency(-openInvoices.reduce((s: number, i: any) => s + Number(i.gross_amount || 0), 0))}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Verfügbare Mittel</span>
                  <span className="font-mono">{formatCurrency(closingTotal - openInvoices.reduce((s: number, i: any) => s + Number(i.gross_amount || 0), 0))}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
      <BillingTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        selectedSingleId={effectiveSingleTpl}
        selectedOverallId={effectiveOverallTpl}
        onSelectSingle={setSelectedTemplate}
        onSelectOverall={setSelectedOverallTemplate}
      />
    </Card>
  );
}
