import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_FUNCTIONS_URL } from "@/integrations/supabase/functions-url";
import JSZip from "jszip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart3, ChevronDown, ChevronRight, Users, PiggyBank, AlertTriangle, Check, FileText, Building2, Loader2, Search, Download, Settings2, FileType, Receipt } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getEffectiveOpeningBalance, getEffectiveClosingBalance, signedTotalForAccount, sumForAccount } from "./lib/bookingAggregation";
import { getAccrualDisplaySign } from "./lib/accrualSign";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { buildOverallPayload, buildOwnerPayload, buildAssetReportPayload, type BillingPayloadInputs } from "./lib/buildBillingPayload";
import {
  remapCommon,
  remapAbrechnungGesamt,
  remapAbrechnungEinzel,
  remapVermoegen,
  remapWirtschaftsplanGesamt,
  remapWirtschaftsplanEinzel,
  remapP35a,
} from "./lib/remapCombinedPayload";
import { AssetReportItemsCard } from "./AssetReportItemsCard";
import { AssetReportSection } from "./AssetReportSection";
import { ManualEconomicPlanEditor } from "./ManualEconomicPlanEditor";
import { Paragraph35aSection } from "./Paragraph35aSection";
import { FinanceDocumentsDialog } from "./FinanceDocumentsDialog";
import { useDmsJobs, type DmsJobItem } from "@/contexts/DmsJobsProvider";

/**
 * Präfix aus der Einheitennummer (4-stellig, z. B. "0001_").
 * Ermöglicht die automatische Zuordnung persönlicher Anhänge in Rundmails.
 */
const unitFilePrefix = (unitNumber?: string | null): string => {
  const digits = String(unitNumber || "").match(/\d+/)?.[0];
  return digits ? `${String(Number(digits)).padStart(4, "0")}_` : "";
};


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
  const { enqueue: enqueueDms } = useDmsJobs();
  const [activeTab, setActiveTab] = useState("total");
  const [docsOpen, setDocsOpen] = useState(false);
  const [busyDownload, setBusyDownload] = useState<string | null>(null); // owner.assignmentId | "overall" | "all"
  // Vorlagen-Verwaltung läuft jetzt zentral über den "Dokumente"-Button im Finance-Header
  // (FinanceDocumentsDialog). Hier nur noch lesender Zugriff auf billing_templates.
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(SECTION_ORDER));
  const [useIstVorschuss, setUseIstVorschuss] = useState(false);
  const [showZeroBalanceAccounts, setShowZeroBalanceAccounts] = useState(false);
  // Wirtschaftsplan-Jahr (Default: Folgejahr des aktuellen Abrechnungsjahrs).
  const [wpYear, setWpYear] = useState<number>(fiscalYear + 1);
  useEffect(() => { setWpYear(fiscalYear + 1); }, [fiscalYear]);

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
  const assetReportTemplates = billingTemplates.filter((t: any) => t.scope === "asset_report");
  const paragraph35aTemplates = billingTemplates.filter((t: any) => t.scope === "paragraph_35a");
  const effectiveSingleTpl = singleTemplates[0]?.id || null;
  const effectiveOverallTpl = overallTemplates[0]?.id || effectiveSingleTpl;
  const effectiveAssetReportTpl = assetReportTemplates[0]?.id || null;
  const effectiveParagraph35aTpl = paragraph35aTemplates[0]?.id || null;

  // openTemplatesFor entfällt — Vorlagen verwaltet jetzt der globale "Dokumente"-Dialog.
  const openTemplatesFor = (_filter?: string) => {
    toast.info("Vorlagen verwaltest du über den Button 'Dokumente' oben rechts.");
  };

  const downloadParagraph35a = async (format: "docx" | "pdf" | "dms") => {
    if (!effectiveParagraph35aTpl) {
      toast.error("Bitte zuerst eine §35a-Vorlage hochladen.");
      openTemplatesFor("paragraph_35a");
      return;
    }
    setBusyDownload("paragraph_35a");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Bitte erneut anmelden.");

      if (format === "dms") {
        const owners = ownerResults;
        if (owners.length === 0) { toast.error("Keine Eigentümer gefunden."); return; }
        const items: DmsJobItem[] = owners.map((o) => {
          const a = (assignments as any[]).find((x) => x.id === o.assignmentId);
          return {
            title: o.name,
            edgeFn: "generate-35a-docx",
            body: {
              template_id: effectiveParagraph35aTpl,
              building_id: buildingId,
              fiscal_year: fiscalYear,
              period_id: periodId,
              assignment_ids: [o.assignmentId],
              format: "pdf",
            },
            displayName: `${unitFilePrefix(a?.unit_number)}§35a_${fiscalYear}_${o.name}${a?.unit_number ? `_${a.unit_number}` : ""}`,
            folderKey: "paragraph_35a",
            visibility: "eigentuemer_only",
            contactId: a?.contact_id || null,
            buildingId,
            periodId,
            managementMode: "weg",
            fiscalYear,
          };
        });
        enqueueDms(`§35a-Bescheinigungen ${fiscalYear}`, items);
        return;
      }



      // PDF-Sammelexport: pro Eigentuemer EIN Function-Aufruf (je eine CloudConvert-
      // Konvertierung) und clientseitig zippen. Ein einziger Aufruf ueber alle
      // Eigentuemer wuerde das Speicher-/Zeitlimit der Edge-Function sprengen
      // (WORKER_RESOURCE_LIMIT). DOCX bleibt ein Sammelaufruf (kein CloudConvert).
      if (format === "pdf") {
        const owners = ownerResults;
        if (owners.length === 0) { toast.error("Keine Eigentuemer gefunden."); return; }
        // Pro Eigentuemer EIN Aufruf (je eine CloudConvert-Konvertierung), in kleinen
        // Parallel-Batches fuer Tempo, mit Fortschrittsanzeige. Dateiname enthaelt die
        // Einheiten-Nr., damit Eigentuemer mit mehreren Einheiten (Wohnung + Garage)
        // sich im ZIP nicht gegenseitig ueberschreiben.
        const zip = new JSZip();
        let done = 0, failed = 0;
        const tId = toast.loading(`Erzeuge §35a-PDFs… 0/${owners.length}`);
        const CONC = 4;
        const genOne = async (o: any) => {
          try {
            const r = await fetch(`${SUPABASE_FUNCTIONS_URL}/generate-35a-docx`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({
                template_id: effectiveParagraph35aTpl,
                building_id: buildingId,
                fiscal_year: fiscalYear,
                period_id: periodId,
                assignment_ids: [o.assignmentId],
                format: "pdf",
              }),
            });
            if (!r.ok) throw new Error(await r.text());
            const unitPart = o.unitNumber && o.unitNumber !== "–" ? `_${sanitizeFilename(o.unitNumber)}` : "";
            zip.file(`35a_${fiscalYear}_${sanitizeFilename(o.name)}${unitPart}.pdf`, await r.blob());
          } catch { failed++; }
          finally { done++; toast.loading(`Erzeuge §35a-PDFs… ${done}/${owners.length}`, { id: tId }); }
        };
        for (let i = 0; i < owners.length; i += CONC) {
          await Promise.all(owners.slice(i, i + CONC).map(genOne));
        }
        const out = await zip.generateAsync({ type: "blob" });
        triggerDownload(out, `35a_${fiscalYear}_PDF.zip`, "application/zip");
        toast.dismiss(tId);
        if (failed) toast.warning(`${failed} von ${owners.length} Bescheinigung(en) fehlgeschlagen — Rest im ZIP.`);
        else toast.success(`${owners.length} §35a-Bescheinigungen als PDF heruntergeladen.`);
        return;
      }

      const resp = await fetch(
        `${SUPABASE_FUNCTIONS_URL}/generate-35a-docx`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            template_id: effectiveParagraph35aTpl,
            building_id: buildingId,
            fiscal_year: fiscalYear,
            period_id: periodId,
            format,
          }),
        },
      );
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const cd = resp.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const fname = m?.[1] || `35a_${fiscalYear}.zip`;
      triggerDownload(blob, fname, blob.type || "application/zip");
      toast.success("Download bereit");
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message || "Unbekannt"));
    } finally {
      setBusyDownload(null);
    }
  };

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
    target: "overall" | "owner" | "all" | "asset_report",
    format: "docx" | "pdf" | "dms",
    owner?: { assignmentId: string; name: string },
  ) => {
    const tplId =
      target === "overall" ? effectiveOverallTpl
      : target === "asset_report" ? effectiveAssetReportTpl
      : effectiveSingleTpl;
    if (!tplId) {
      toast.error("Bitte zuerst eine Vorlage hochladen (Vorlagen-Verwaltung).");
      openTemplatesFor(target === "overall" ? "overall" : target === "asset_report" ? "asset_report" : "single");
      return;
    }
    const busyKey = target === "owner" ? owner!.assignmentId : target;
    setBusyDownload(busyKey);
    try {
      const inp = buildPayloadInputs();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Bitte erneut anmelden, um die Abrechnung herunterzuladen.");

      const callOnce = async (
        body: any,
      ): Promise<Blob> => {
        const resp = await fetch(
          `${SUPABASE_FUNCTIONS_URL}/generate-billing-document`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify(body),
          },
        );
        if (!resp.ok) throw new Error((await resp.text()) || `Export fehlgeschlagen (${resp.status})`);
        return await resp.blob();
      };

      // DMS-Modus: in Hintergrund-Queue einreihen (überlebt Seitenwechsel).
      if (format === "dms") {
        if (target === "overall") {
          enqueueDms(`Gesamtabrechnung ${fiscalYear}`, [{
            title: `Gesamtabrechnung ${fiscalYear}`,
            edgeFn: "generate-billing-document",
            body: {
              template_id: tplId, overall_template_id: effectiveOverallTpl,
              fiscal_year: fiscalYear, mode: "single", format: "pdf",
              file_prefix: `Gesamtabrechnung_${fiscalYear}`,
              items: [{ kind: "overall", payload: buildOverallPayload(inp) }],
            },
            displayName: `Gesamtabrechnung_${fiscalYear}`,
            folderKey: "gesamtabrechnung",
            visibility: "alle",
            buildingId, periodId, managementMode: "weg", fiscalYear,
          }]);
        } else if (target === "asset_report") {
          enqueueDms(`Vermögensbericht ${fiscalYear}`, [{
            title: `Vermögensbericht ${fiscalYear}`,
            edgeFn: "generate-billing-document",
            body: {
              template_id: tplId, overall_template_id: effectiveOverallTpl,
              fiscal_year: fiscalYear, mode: "single", format: "pdf",
              file_prefix: `Vermoegensbericht_${fiscalYear}`,
              items: [{ kind: "asset_report", payload: buildAssetReportPayload(inp) }],
            },
            displayName: `Vermoegensbericht_${fiscalYear}`,
            folderKey: "vermoegensbericht",
            visibility: "alle",
            buildingId, periodId, managementMode: "weg", fiscalYear,
          }]);
        } else {
          const targetOwners = target === "owner"
            ? [{ assignmentId: owner!.assignmentId, name: owner!.name }]
            : ownerResults.map((o) => ({ assignmentId: o.assignmentId, name: o.name }));
          if (targetOwners.length === 0) { toast.error("Keine Eigentümer gefunden."); return; }
          const jobItems: DmsJobItem[] = targetOwners.map((o) => {
            const a = (assignments as any[]).find((x) => x.id === o.assignmentId);
            const unitNo = a?.unit_number ? String(a.unit_number) : "";
            return {
              title: o.name,
              edgeFn: "generate-billing-document",
              body: {
                template_id: tplId, overall_template_id: effectiveOverallTpl,
                fiscal_year: fiscalYear, mode: "single", format: "pdf",
                file_prefix: `Einzelabrechnung_${fiscalYear}`,
                items: [{ kind: "owner", ownerId: o.assignmentId, ownerName: o.name, unitNumber: unitNo, payload: buildOwnerPayload(inp, o.assignmentId) }],
              },
              // Einheitennummer im Anzeigenamen, damit Eigentuemer mit mehreren
              // Einheiten (z. B. Wohnung + Garage) je Einheit ein eigenes,
              // eindeutiges Dokument im DMS erhalten.
              displayName: `Einzelabrechnung_${fiscalYear}_${o.name}${unitNo ? `_${unitNo}` : ""}`,
              folderKey: "einzelabrechnung",
              visibility: "eigentuemer_only",
              contactId: a?.contact_id || null,
              buildingId, periodId, managementMode: "weg", fiscalYear,
            };
          });
          enqueueDms(`Einzelabrechnungen ${fiscalYear}`, jobItems);
        }
        return;
      }



      // Sammel-Download: pro Dokument ein eigener, kleiner Funktionsaufruf und
      // ZIP im Browser bauen — ein einzelner Batch-Request lief bei vielen
      // Eigentümern in das Rechenlimit der Edge Function (WORKER_RESOURCE_LIMIT).
      if (target === "all") {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const zipErrors: string[] = [];
        const jobs: Array<{ label: string; fileBase: string; body: any }> = [
          {
            label: "Gesamtabrechnung",
            fileBase: `00_Abrechnung_${fiscalYear}_Gesamt`,
            body: {
              template_id: tplId, overall_template_id: effectiveOverallTpl,
              fiscal_year: fiscalYear, mode: "single", format,
              file_prefix: `Abrechnung_${fiscalYear}`,
              items: [{ kind: "overall", payload: buildOverallPayload(inp) }],
            },
          },
          ...ownerResults.map((o) => ({
            label: o.name,
            // Einheitennummer im Dateinamen, damit Eigentuemer mit mehreren
            // Einheiten (z. B. Wohnung + Garage) nicht denselben Namen erhalten
            // und sich im ZIP gegenseitig ueberschreiben.
            fileBase: `Abrechnung_${fiscalYear}_${sanitizeFilename(o.name)}${o.unitNumber && o.unitNumber !== "–" ? `_${sanitizeFilename(o.unitNumber)}` : ""}`,
            body: {
              template_id: tplId, overall_template_id: effectiveOverallTpl,
              fiscal_year: fiscalYear, mode: "single", format,
              file_prefix: `Abrechnung_${fiscalYear}`,
              items: [{ kind: "owner", ownerId: o.assignmentId, ownerName: o.name, unitNumber: o.unitNumber, payload: buildOwnerPayload(inp, o.assignmentId) }],
            },
          })),
        ];
        for (let i = 0; i < jobs.length; i++) {
          toast.message(`Dokument ${i + 1}/${jobs.length}: ${jobs[i].label}…`);
          try {
            const blob = await callOnce(jobs[i].body);
            zip.file(`${jobs[i].fileBase}.${format}`, blob);
          } catch (err) {
            zipErrors.push(`${jobs[i].label}: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`);
          }
        }
        if (zipErrors.length > 0) zip.file("FEHLER.txt", zipErrors.join("\n"));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerDownload(zipBlob, `Abrechnung_${fiscalYear}${format === "pdf" ? "_PDF" : ""}.zip`, "application/zip");
        toast.success(zipErrors.length > 0 ? `Download bereit — ${zipErrors.length} Dokument(e) fehlgeschlagen (siehe FEHLER.txt im ZIP)` : "Download bereit");
        return;
      }

      // Einzeldokument-Download (DOCX/PDF).
      let items: Array<{ kind: "owner" | "overall" | "asset_report"; ownerId?: string; ownerName?: string; payload: any }> = [];
      if (target === "overall") {
        items = [{ kind: "overall", payload: buildOverallPayload(inp) }];
      } else if (target === "asset_report") {
        items = [{ kind: "asset_report", payload: buildAssetReportPayload(inp) }];
      } else {
        items = [{ kind: "owner", ownerId: owner!.assignmentId, ownerName: owner!.name, payload: buildOwnerPayload(inp, owner!.assignmentId) }];
      }
      const mode = "single";
      const filePrefix =
        target === "asset_report" ? `Vermoegensbericht_${fiscalYear}` : `Abrechnung_${fiscalYear}`;
      const bytes = await callOnce({
        template_id: tplId,
        overall_template_id: effectiveOverallTpl,
        fiscal_year: fiscalYear,
        mode,
        format,
        file_prefix: filePrefix,
        items,
      });
      const ext = format;
      const mime =
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const fname =
        target === "owner"
          ? `Einzelabrechnung_${sanitizeFilename(owner!.name)}_${fiscalYear}.${ext}`
          : target === "overall"
            ? `Gesamtabrechnung_${fiscalYear}.${ext}`
            : target === "asset_report"
              ? `Vermoegensbericht_${fiscalYear}.${ext}`
              : `Abrechnung_${fiscalYear}.${ext}`;
      triggerDownload(bytes, fname, mime);
      toast.success("Download bereit");
    } catch (e: any) {
      toast.error("Fehler: " + (e?.message || "Unbekannt"));
    } finally {
      setBusyDownload(null);
    }
  };

  // Globaler Dokumente-Button (Finance-Header) → existierende Download-Funktionen aufrufen.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { target: string; format: "docx" | "pdf" | "dms" };
      if (!detail) return;
      switch (detail.target) {
        case "overall": downloadBilling("overall", detail.format); break;
        case "all": downloadBilling("all", detail.format); break;
        case "asset_report": downloadBilling("asset_report", detail.format); break;
        case "paragraph_35a": downloadParagraph35a(detail.format); break;
        case "combined_report": downloadCombined(detail.format); break;
        // economic_plan_* wird vom ManualEconomicPlanEditor selbst behandelt
      }
    };
    const switchTab = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab: string };
      if (detail?.tab) setActiveTab(detail.tab);
    };
    window.addEventListener("finance:request-download", handler as EventListener);
    window.addEventListener("finance:switch-settlement-tab", switchTab as EventListener);
    return () => {
      window.removeEventListener("finance:request-download", handler as EventListener);
      window.removeEventListener("finance:switch-settlement-tab", switchTab as EventListener);
    };
  });

  // Synchroner Payload-Collector für den Sammelbericht.
  // Wird vom Sammelbericht-Button dispatched; alle Tab-Editoren schreiben
  // ihre Payloads (UI = Source of Truth) inline ins detail.payloads-Objekt.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { payloads: Record<string, any>; errors?: string[] };
      if (!detail?.payloads) return;
      try {
        const inp = buildPayloadInputs();
        detail.payloads.overall = buildOverallPayload(inp);
        detail.payloads.asset_report = buildAssetReportPayload(inp);
        detail.payloads.owners = ownerResults.map((o) => ({
          assignmentId: o.assignmentId,
          name: o.name,
          payload: buildOwnerPayload(inp, o.assignmentId),
        }));
      } catch (err: any) {
        (detail.errors ||= []).push(`Abrechnung: ${err?.message || err}`);
      }
    };
    window.addEventListener("finance:collect-combined-payload", handler as EventListener);
    return () => window.removeEventListener("finance:collect-combined-payload", handler as EventListener);
  });

  // Sammelbericht-Trigger: sammelt Payloads aller Tabs (Abrechnung + Wirtschaftsplan + §35a),
  // mergt sie pro Eigentümer und ruft generate-billing-document mit der combined_report-Vorlage auf.
  // Es gibt nur Einzel-Sammelberichte (pro Eigentümer), da jeder Sammelbericht die Gesamtdaten enthält.
  const downloadCombined = async (format: "docx" | "pdf" | "dms") => {
    const combinedTpls = billingTemplates.filter((t: any) => t.scope === "combined_report");
    const tplId = combinedTpls[0]?.id;
    if (!tplId) {
      toast.error("Bitte zuerst eine Sammelbericht-Vorlage hochladen.");
      setDocsOpen(true);
      return;
    }
    // Sicherstellen, dass Wirtschaftsplan-Tab schon einmal aktiv war (forceMount sollte das erledigen,
    // aber zur Sicherheit kurz darauf umschalten, falls noch kein Mount erfolgt ist).
    const detail: any = { payloads: {}, errors: [] };
    window.dispatchEvent(new CustomEvent("finance:collect-combined-payload", { detail }));
    if (detail.errors?.length) { toast.error(detail.errors.join(" | ")); return; }
    const p = detail.payloads;
    if (!p.overall) { toast.error("Abrechnungs-Daten fehlen."); return; }
    if (!p.economic_plan_overall) {
      toast.error("Wirtschaftsplan-Daten fehlen — bitte den Wirtschaftsplan-Tab kurz öffnen und erneut versuchen.");
      return;
    }

    setBusyDownload("combined_owners");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Bitte erneut anmelden.");

      // §35a-Payloads parallel von Edge Function abholen (payloads_only Modus).
      let p35aItems: any[] = [];
      try {
        const r35 = await fetch(
          `${SUPABASE_FUNCTIONS_URL}/generate-35a-docx`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              building_id: buildingId,
              fiscal_year: fiscalYear,
              period_id: periodId,
              mode: "payloads_only",
            }),
          },
        );
        if (r35.ok) {
          const j = await r35.json();
          p35aItems = j.items || [];
        } else {
          console.warn("§35a payloads konnten nicht geladen werden:", await r35.text());
        }
      } catch (e) {
        console.warn("§35a Aufruf fehlgeschlagen", e);
      }

      const epOwners: any[] = p.economic_plan_owners || [];
      // Common-Felder fürs Deckblatt aus dem reichsten Owner-Payload ziehen.
      const pickCommon = (src: any) => {
        if (!src) return {};
        const keys = ["wirtschaftsjahr", "gebaeude_name", "gebaeude_adresse", "empfaenger_name",
          "empfaenger_anschrift", "stichtag", "abrechnungszeitraum", "abrechnungszeitraum_von",
          "abrechnungszeitraum_bis", "verwalter_name", "verwalter_anschrift", "datum_heute"];
        const out: any = {};
        for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
        return out;
      };
      const items = (p.owners || []).map((o: any) => {
        const ep = epOwners.find((e) => e.ownerId === o.assignmentId) || epOwners.find((e) => e.name === o.name);
        const p35 = p35aItems.find((x: any) => x.assignment_id === o.assignmentId)
          || p35aItems.find((x: any) => x.owner_name === o.name);
        // Common (Deckblatt) aus reichstem Owner-Payload + overall ziehen und auf neue
        // Sammelbericht-Konvention normalisieren (datum_heute, abrechnungszeitraum_*, …).
        const common = remapCommon({ ...pickCommon(o.payload), ...pickCommon(p.overall) });
        const oa = (assignments as any[]).find((x) => x.id === o.assignmentId);
        return {
          kind: "owner",
          ownerId: o.assignmentId,
          ownerName: o.name,
          unitNumber: oa?.unit_number ? String(oa.unit_number) : undefined,
          payload: {
            // Top-Level Common (Deckblatt-Variablen ohne Prefix)
            ...common,
            // 6 vollständige Sub-Payloads, jeweils mit Common-Fallback gemerged und
            // auf die Platzhalter-Namen der v2-Vorlage gemappt.
            abrechnung_gesamt:      { ...common, ...remapAbrechnungGesamt(p.overall) },
            abrechnung_einzel:      { ...common, ...remapAbrechnungEinzel(o.payload) },
            vermoegen:              { ...common, ...remapVermoegen(p.asset_report) },
            wirtschaftsplan_gesamt: { ...common, ...remapWirtschaftsplanGesamt(p.economic_plan_overall) },
            wirtschaftsplan_einzel: { ...common, ...remapWirtschaftsplanEinzel(ep?.payload) },
            p35a:                   { ...common, ...remapP35a(p35?.payload) },
          },
        };
      });

      if (!items.length) { toast.error("Keine Eigentümer gefunden."); setBusyDownload(null); return; }

      const prefix = `Sammelberichte_${fiscalYear}`;

      if (format === "dms") {
        const jobItems: DmsJobItem[] = items.map((it: any) => {
          const a = (assignments as any[]).find((x) => x.id === it.ownerId);
          return {
            title: it.ownerName,
            edgeFn: "generate-billing-document",
            body: {
              template_id: tplId, fiscal_year: fiscalYear,
              mode: "single", format: "pdf", file_prefix: prefix,
              items: [it],
            },
            displayName: `Sammelbericht_${fiscalYear}_${it.ownerName}${it.unitNumber ? `_${it.unitNumber}` : ""}`,
            folderKey: "sammelbericht",
            visibility: "eigentuemer_only",
            contactId: a?.contact_id || null,
            buildingId, periodId, managementMode: "weg", fiscalYear,
          };
        });
        enqueueDms(`Sammelberichte ${fiscalYear}`, jobItems);
      } else {
        const resp = await fetch(
          `${SUPABASE_FUNCTIONS_URL}/generate-billing-document`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              template_id: tplId,
              fiscal_year: fiscalYear,
              mode: "all",
              format,
              file_prefix: prefix,
              items,
            }),
          },
        );
        if (!resp.ok) throw new Error(await resp.text());
        const bytes = await resp.blob();
        triggerDownload(bytes, `${prefix}.zip`, "application/zip");
        toast.success("Sammelberichte bereit");
      }
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






  // --- Render helper for Gesamtabrechnung section ---
  const renderSection = (section: string) => {
    const accs = sectionAccounts[section] || [];
    if (accs.length === 0 && section !== "reserve") return null;
    const wpTotal = accs.reduce((s, a) => s + a.wpAmount, 0);
    // Verteilungsrelevante Summe nutzt Magnitude (Kostensumme zur Verteilung)
    const distTotal = accs.filter(a => a.is_distributable).reduce((s, a) => s + a.totalAbs, 0);
    const isExpanded = expandedSections.has(section);
    const isIncomeSection = section === "income";
    const isAccrualSection = section === "accrual";

    // Vorzeichen-Konvention für die Anzeige:
    //  - Einnahmen-Sektion → positive Werte mit "+"
    //  - Aufwands-Sektionen (Bewirtschaftung, Heizung, Rücklage) → mit "−"
    //  - Abgrenzungs-Sektion → pro Konto je nach Konto-Nummer (siehe accrualSign.ts)
    const isExpenseSection = section !== "income";

    // Pro-Konto Anzeigewert (signiert) — bei Abgrenzungen abhängig von Kontonummer
    const accountDisplayValue = (acc: any): number => {
      if (isAccrualSection) return acc.totalAbs * getAccrualDisplaySign(acc.account_number);
      if (isIncomeSection) return acc.totalAbs; // Einnahmen positiv
      return -acc.totalAbs; // Aufwand negativ
    };

    const sectionDisplayTotal = accs.reduce((s, a) => s + accountDisplayValue(a), 0);

    const renderSigned = (n: number) => {
      const v = Math.round(n * 100) / 100;
      if (v === 0) return <span className="font-mono">{formatCurrency(0)}</span>;
      const positive = v > 0;
      return (
        <span className={cn("font-mono", positive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
          {positive ? "+" : "−"}{formatCurrency(Math.abs(v))}
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
            <span className="font-medium">{renderSigned(sectionDisplayTotal)}</span>
            {distTotal > 0 && Math.abs(distTotal - Math.abs(sectionDisplayTotal)) > 0.005 && (
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
                  <TableCell className="text-right text-sm">{renderSigned(accountDisplayValue(acc))}</TableCell>
                  <TableCell className="text-right text-sm">
                    {acc.is_distributable ? renderSigned(accountDisplayValue(acc)) : <span className="font-mono">–</span>}
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
                <TableCell className="text-right text-sm font-semibold">{renderSigned(sectionDisplayTotal)}</TableCell>
                <TableCell className="text-right text-sm font-semibold">
                  {distTotal > 0 ? renderSigned(accs.filter(a => a.is_distributable).reduce((s, a) => s + accountDisplayValue(a), 0)) : <span className="font-mono">–</span>}
                </TableCell>

              </TableRow>
            </TableBody>
          </Table>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const selectedOwnerData = selectedOwner ? ownerResults.find(o => o.assignmentId === selectedOwner) : null;

  // Wiederverwendbarer Tab-Download-Button (DOCX/PDF + Vorlage wählen).
  const TabDownloadMenu = ({
    target,
    label,
    scope,
    busyKey,
    onOwner,
  }: {
    target: "overall" | "asset_report" | "all" | "owner";
    label: string;
    scope: "overall" | "single" | "asset_report";
    busyKey: string;
    onOwner?: { assignmentId: string; name: string };
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={busyDownload === busyKey}>
          {busyDownload === busyKey ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
          {label}
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => downloadBilling(target, "docx", onOwner)}>
          <FileType className="h-4 w-4 mr-2" /> DOCX
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadBilling(target, "pdf", onOwner)}>
          <FileText className="h-4 w-4 mr-2" /> PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openTemplatesFor(scope)}>
          <Settings2 className="h-4 w-4 mr-2" /> Vorlage wählen / hochladen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
        {/* Vorlagen und Downloads jetzt im globalen "Dokumente"-Button (Finance-Header). */}
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <TabsList variant="underline" className="flex-wrap h-auto">
              <TabsTrigger variant="underline" value="total">Gesamtabrechnung</TabsTrigger>
              <TabsTrigger variant="underline" value="owners">
                <Users className="h-4 w-4 mr-1" /> Einzelabrechnungen ({ownerResults.length})
              </TabsTrigger>
              <TabsTrigger variant="underline" value="assets">
                <Building2 className="h-4 w-4 mr-1" /> Vermögensbericht
              </TabsTrigger>
              <TabsTrigger variant="underline" value="wirtschaftsplan">
                <FileText className="h-4 w-4 mr-1" /> Wirtschaftsplan
              </TabsTrigger>
              <TabsTrigger variant="underline" value="paragraph35a">
                <Receipt className="h-4 w-4 mr-1" /> §35a Bescheinigung
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setDocsOpen(true)}>
                <FileText className="h-4 w-4" />
                Dokumente
              </Button>
            </div>
          </div>
          <FinanceDocumentsDialog
            open={docsOpen}
            onOpenChange={setDocsOpen}
            selectedBuildingId={buildingId}
            selectedPeriodId={periodId}
          />


          {/* ===== TAB 1: GESAMTABRECHNUNG ===== */}
          <TabsContent value="total" className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Null-Saldo Konten anzeigen</span>
                <Switch checked={showZeroBalanceAccounts} onCheckedChange={setShowZeroBalanceAccounts} />
              </div>
              <span className="text-xs text-muted-foreground">Download via Button "Dokumente" oben</span>
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
              {reserveAccountsList
                .filter((a) => Math.abs(a.opening) > 0.005 || Math.abs(a.closing) > 0.005)
                .map((a) => (
                  <div key={`op-res-${a.account_number}`} className="flex justify-between text-sm pl-4 text-muted-foreground">
                    <span>{a.account_number} {a.account_name}</span>
                    <span className="font-mono">{formatCurrency(Math.abs(a.opening))}</span>
                  </div>
                ))}
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
            {SECTION_ORDER.filter(s => s !== "income").map(section => renderSection(section))}

            {/* Abrechnungssumme */}
            <div className="space-y-2 mt-4">
              <div className="flex justify-between p-3 rounded-lg bg-muted/30 text-sm">
                <span>Abrechnungssumme (Gesamtkosten)</span>
                <span className="font-mono font-medium">{formatCurrency(abrechnungssumme)}</span>
              </div>
              <div className="flex justify-between p-3 rounded-lg bg-muted/30 text-sm">
                <span>Vorschussverpflichtung (Hausgeld + IHR, Soll)</span>
                <span className="font-mono font-medium">{formatCurrency(vorschussFuerSpitze)}</span>
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
              {reserveAccountsList
                .filter((a) => Math.abs(a.opening) > 0.005 || Math.abs(a.closing) > 0.005)
                .map((a) => (
                  <div key={`cl-res-${a.account_number}`} className="flex justify-between text-sm pl-4 text-muted-foreground">
                    <span>{a.account_number} {a.account_name}</span>
                    <span className="font-mono">{formatCurrency(Math.abs(a.closing))}</span>
                  </div>
                ))}
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
            {/* SOLL/IST Toggle + Download */}
            <div className="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg bg-muted/30 flex-wrap">
              <div className="flex items-center gap-3">
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
              {/* Bulk-Download alle Einzelabrechnungen → Button "Dokumente" oben rechts. */}
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
                  <TabDownloadMenu
                    target="owner"
                    label="Diese Einzelabrechnung"
                    scope="single"
                    busyKey={selectedOwnerData.assignmentId}
                    onOwner={{ assignmentId: selectedOwnerData.assignmentId, name: selectedOwnerData.name }}
                  />
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
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Gemäß §28 WEG — Vermögenslage zum Ende des Abrechnungszeitraums {fiscalYear}.
              </p>
              <span className="text-xs text-muted-foreground">Download via Button "Dokumente" oben</span>
            </div>

            <AssetReportSection buildingId={buildingId} periodId={periodId} fiscalYear={fiscalYear} ownerResults={ownerResults} />
          </TabsContent>

          <TabsContent value="wirtschaftsplan" forceMount className="space-y-4 data-[state=inactive]:hidden">
            <div className="flex items-center justify-between gap-2 flex-wrap rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-sm text-muted-foreground">
                Geplante Kosten pro Konto für das gewählte Wirtschaftsjahr. Auto-Save beim Bearbeiten.
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="wp-year" className="text-xs text-muted-foreground">Wirtschaftsjahr</label>
                <Input
                  id="wp-year"
                  type="number"
                  value={wpYear}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v > 2000 && v < 2100) setWpYear(v);
                  }}
                  className="h-8 w-24 text-sm"
                />
              </div>
            </div>
            <ManualEconomicPlanEditor buildingId={buildingId} fiscalYear={wpYear} />
          </TabsContent>

          <TabsContent value="paragraph35a" className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Gemäß §35a EStG — Bescheinigung haushaltsnaher Dienstleistungen und Handwerkerleistungen.
              </p>
              <span className="text-xs text-muted-foreground">Download via Button "Dokumente" oben</span>
            </div>
            <Paragraph35aSection buildingId={buildingId} periodId={periodId} fiscalYear={fiscalYear} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
