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
import { BarChart3, ChevronDown, ChevronRight, Download, Users, PiggyBank, AlertTriangle, Check, FileText, Building2, Loader2, Search, Calculator, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface BillingSettlementProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

const DIST_KEY_TO_SHARE: Record<string, string> = {
  mea: "mea", einheiten: "einheit", qm: "qm", personen: "personen",
  verbrauch_wasser: "wasser", verbrauch_warmwasser: "warmwasser",
  heizkostenverordnung: "heizkosten",
};

const SHARE_LABELS: Record<string, string> = {
  mea: "Ges.Tausendstel", einheit: "Einheiten", qm: "Wohnfläche (m²)",
  personen: "Personen", wasser: "Wasserverbr.", warmwasser: "Warmwasserverbr.",
  heizkosten: "Heizk.Abr.", direkt: "Direkt",
};

const SECTION_LABELS: Record<string, string> = {
  income: "Einnahmen",
  operating_distributable: "Umlagefähige Bewirtschaftungskosten",
  operating_non_distributable: "Nicht umlagefähige Kosten",
  heating_prepayment: "Heizkosten-Vorauszahlungen (Durchlauf)",
  accrual: "Abgrenzungen",
  reserve: "Instandhaltungsrücklage",
  reserve_withdrawal: "Entnahme aus Rücklage",
  bank: "Bankkonten",
  opening: "Eröffnungsbuchungen",
};

// Note: heating_prepayment is shown informatively but NOT included in the Abrechnungssumme.
// It only becomes part of the settlement after being reposted to account 1400 (Heizkostenabrechnung).
// 'opening' (Eröffnungsbuchungen) and 'bank' are excluded from the settlement display entirely.
const SECTION_ORDER = ["income", "operating_distributable", "operating_non_distributable", "heating_prepayment", "accrual", "reserve", "reserve_withdrawal"];

export function BillingSettlement({ buildingId, periodId, fiscalYear }: BillingSettlementProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("total");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(SECTION_ORDER));
  const [useIstVorschuss, setUseIstVorschuss] = useState(false);
  const [calculatingSalden, setCalculatingSalden] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [generatingAiSummary, setGeneratingAiSummary] = useState(false);

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

  // All bookings for the year — include counter_account_id for bank-centric aggregation
  const { data: rawBookings = [] } = useQuery({
    queryKey: ["settlement-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount, booking_type, booking_category, description, is_35a_relevant")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
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
      return data;
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

  // Bank-zentrische Buchhaltung: Beträge können auf account_id ODER counter_account_id liegen.
  // Wir summieren beide Seiten und nehmen den Absolutwert (Anzeige als positive Kostensumme).
  const getAccountBookingTotal = (accountId: string) => {
    const total = bookings
      .filter((b) =>
        (b.account_id === accountId || (b as any).counter_account_id === accountId) &&
        b.booking_category !== "heating_repost"
      )
      .reduce((s, b) => {
        const amt = Number(b.amount) || 0;
        if (b.account_id === accountId) return s + amt;
        if ((b as any).counter_account_id === accountId) return s - amt;
        return s;
      }, 0);
    return Math.abs(total);
  };

  const getWpAmount = (accountId: string) => {
    const item = wpItems.find((w: any) => w.account_id === accountId);
    return item ? Number(item.planned_amount) : 0;
  };

  // Group accounts by settlement_section
  const sectionAccounts: Record<string, Array<any & { total: number; wpAmount: number; distKey: string }>> = {};
  accounts.forEach((acc) => {
    const section = acc.settlement_section;
    if (!section) return;
    const total = getAccountBookingTotal(acc.id);
    if (total === 0 && section !== "reserve") return; // Show reserve even if 0
    if (!sectionAccounts[section]) sectionAccounts[section] = [];
    sectionAccounts[section].push({
      ...acc,
      total,
      wpAmount: getWpAmount(acc.id),
      distKey: getDistKey(acc.id, acc.default_distribution_key),
    });
  });

  // Calculate totals per section
  const getSectionTotal = (section: string) =>
    (sectionAccounts[section] || []).reduce((s, a) => s + a.total, 0);

  const totalIncome = getSectionTotal("income");
  const totalOperatingDist = getSectionTotal("operating_distributable");
  const totalOperatingNonDist = getSectionTotal("operating_non_distributable");
  const totalAccrual = getSectionTotal("accrual");
  const totalReserve = getSectionTotal("reserve");
  const totalReserveWithdrawal = getSectionTotal("reserve_withdrawal");

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
  carryAccounts.forEach((acc: any) => {
    const eff = getEffectiveOpeningBalance(acc.id, bookings as any[], flatBalances, fiscalYear, opening4000Id);
    openingByAccount[acc.id] = eff.amount;
  });
  const openingGiro = carryAccounts
    .filter((a: any) => a.category !== "ruecklage")
    .reduce((s: number, a: any) => s + (openingByAccount[a.id] || 0), 0);
  const openingReserve = carryAccounts
    .filter((a: any) => a.category === "ruecklage")
    .reduce((s: number, a: any) => s + (openingByAccount[a.id] || 0), 0);
  const openingTotal = openingGiro + openingReserve;

  // Closing balances
  const closingGiro = balances
    .filter((b: any) => b.chart_of_accounts?.category !== "ruecklage" && b.chart_of_accounts?.carry_forward_balance)
    .reduce((s, b) => s + Number(b.closing_balance), 0);
  const closingReserve = balances
    .filter((b: any) => b.chart_of_accounts?.category === "ruecklage")
    .reduce((s, b) => s + Number(b.closing_balance), 0);
  const closingTotal = closingGiro + closingReserve;

  // Distributable total (for Einzelabrechnung)
  const totalDistributable = accounts
    .filter((a) => a.is_distributable)
    .reduce((s, a) => s + getAccountBookingTotal(a.id), 0);

  // Abrechnungssumme
  const abrechnungssumme = totalOperatingDist + totalOperatingNonDist + totalAccrual + totalReserve - totalReserveWithdrawal;

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

  // Vorschussverpflichtung (total prepayments from all owners)
  const totalVorschuss = assignments.reduce((s, a: any) => {
    const costs = a.contact_building_costs || [];
    const timeProp = getTimeProportion(a);
    return s + costs.reduce((cs: number, c: any) => {
      if (!period) {
        const amount = Number(c.amount);
        switch (c.interval) {
          case "monatlich": return cs + amount * 12 * timeProp;
          case "quartal": return cs + amount * 4 * timeProp;
          case "jaehrlich": return cs + amount * timeProp;
          default: return cs + amount * 12 * timeProp;
        }
      }
      return cs + getCostAnnualAmount(c, period.period_from, period.period_to) * timeProp;
    }, 0);
  }, 0);

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
    const mapped = DIST_KEY_TO_SHARE[shareType] || shareType;
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
    const accountBreakdown: Array<{
      accountNumber: string; accountName: string; distributableAmount: number;
      distKey: string; totalShares: number; ownerShare: number; ownerCost: number;
      settlement35aType: string | null;
    }> = [];

    let totalOwnerCost = 0;
    let owner35aDienste = 0;
    let owner35aHandwerker = 0;

    // Distributable accounts
    const distributableAccounts = accounts.filter((a) => a.is_distributable);
    distributableAccounts.forEach((acc) => {
      const total = getAccountBookingTotal(acc.id);
      if (total === 0) return;

      const distKey = getDistKey(acc.id, acc.default_distribution_key);
      const shareType = DIST_KEY_TO_SHARE[distKey] || distKey;

      // Special handling for heating account (1400) — use heating_distribution_values if available
      const isHeatingAccount = acc.is_heating_relevant && acc.account_number === "1400";
      let ownerCost = 0;
      let ownerShareValue = 0;
      let totalSharesValue = 0;

      if (isHeatingAccount && heatingDistValues.length > 0) {
        const hdv = heatingDistValues.find((h: any) => h.assignment_id === assignment.id);
        ownerCost = hdv ? Number(hdv.amount) : 0;
        ownerShareValue = ownerCost;
        totalSharesValue = total;
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
      });
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
          .filter((c: any) => c.cost_type === "hausgeld" || c.cost_type === "nebenkosten")
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
          .filter((c: any) => c.cost_type === "ruecklage")
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
        .filter((c: any) => c.cost_type === "hausgeld" || c.cost_type === "nebenkosten")
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
        .filter((c: any) => c.cost_type === "ruecklage")
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

  // PDF generation
  const generatePdfs = async () => {
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-billing-pdf", {
        body: { buildingId, periodId, fiscalYear },
      });
      if (error) throw error;
      if (data?.url) { window.open(data.url, "_blank"); toast.success("PDF erstellt"); }
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally { setGeneratingPdf(false); }
  };

  const generateOwnerPdf = async (ownerId: string, ownerName: string) => {
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-billing-pdf", {
        body: { buildingId, periodId, fiscalYear, ownerId },
      });
      if (error) throw error;
      if (data?.url) { window.open(data.url, "_blank"); toast.success(`PDF für ${ownerName} erstellt`); }
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally { setGeneratingPdf(false); }
  };

  const exportCsv = () => {
    const lines = [`Gesamtabrechnung ${fiscalYear}`, "",
      "Einheit;Eigentümer;Kostenanteil;Hausgeld;Rücklage;Gesamt;Ergebnis;§35a Dienste;§35a Handwerker"];
    ownerResults.forEach(o => {
      lines.push([o.unitNumber, o.name, o.totalOwnerCost.toFixed(2).replace(".", ","),
        o.hausgeld.toFixed(2).replace(".", ","), o.reserve.toFixed(2).replace(".", ","),
        o.totalPaid.toFixed(2).replace(".", ","),
        `${o.result.toFixed(2).replace(".", ",")} (${o.result >= 0 ? "Guthaben" : "Nachzahlung"})`,
        o.owner35aDienste.toFixed(2).replace(".", ","),
        o.owner35aHandwerker.toFixed(2).replace(".", ","),
      ].join(";"));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Abrechnung_${fiscalYear}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportiert");
  };

  // --- Closing balance calculation ---
  const calculateClosingBalances = async () => {
    setCalculatingSalden(true);
    try {
      const carryForwardAccounts = accounts.filter(a => a.carry_forward_balance);
      let updated = 0;
      
      for (const acc of carryForwardAccounts) {
        const accountBookings = bookings.filter(b => b.account_id === acc.id);
        const bookingSum = accountBookings.reduce((s, b) => s + Number(b.amount), 0);
        
        const existingBalance = balances.find((bal: any) => bal.account_id === acc.id);
        const opening = existingBalance ? Number(existingBalance.opening_balance) : 0;
        const closing = opening + bookingSum;
        
        if (existingBalance) {
          await supabase.from("account_balances").update({ closing_balance: closing }).eq("id", existingBalance.id);
        } else {
          await supabase.from("account_balances").insert({
            account_id: acc.id,
            building_id: buildingId,
            fiscal_year: fiscalYear,
            opening_balance: 0,
            closing_balance: closing,
          });
        }
        updated++;
      }
      
      queryClient.invalidateQueries({ queryKey: ["account-balances-settlement"] });
      toast.success(`${updated} Kontensalden aktualisiert`);
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally {
      setCalculatingSalden(false);
    }
  };

  // --- AI Summary ---
  const generateAiSummary = async () => {
    setGeneratingAiSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-billing", {
        body: { 
          buildingId, periodId, fiscalYear, 
          mode: "settlement_summary",
          settlementData: {
            totalIncome, totalOperatingDist, totalOperatingNonDist, totalReserve,
            abrechnungssumme, totalVorschuss, abrechnungsspitze,
            ownerCount: ownerResults.length,
            owners: ownerResults.map(o => ({ name: o.name, unit: o.unitNumber, cost: o.totalOwnerCost, paid: o.totalPaid, result: o.result })),
          }
        },
      });
      if (error) throw error;
      setAiSummary(data?.summary || data?.text || "Keine Zusammenfassung generiert.");
      toast.success("KI-Zusammenfassung erstellt");
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannt"));
    } finally {
      setGeneratingAiSummary(false);
    }
  };

  // --- Render helper for Gesamtabrechnung section ---
  const renderSection = (section: string) => {
    const accs = sectionAccounts[section] || [];
    if (accs.length === 0 && section !== "reserve") return null;
    const total = getSectionTotal(section);
    const wpTotal = accs.reduce((s, a) => s + a.wpAmount, 0);
    const distTotal = accs.filter(a => a.is_distributable).reduce((s, a) => s + a.total, 0);
    const isExpanded = expandedSections.has(section);

    return (
      <Collapsible key={section} open={isExpanded} onOpenChange={() => toggleSection(section)}>
        <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted text-left">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium text-sm">{SECTION_LABELS[section] || section}</span>
            <Badge variant="outline" className="text-xs">{accs.length}</Badge>
          </div>
          <div className="flex gap-4 text-sm font-mono">
            {wpTotal > 0 && <span className="text-muted-foreground">{formatCurrency(wpTotal)}</span>}
            <span className="font-medium">{formatCurrency(total)}</span>
            {distTotal > 0 && distTotal !== total && <span className="text-muted-foreground">{formatCurrency(distTotal)}</span>}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Konto</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="text-right w-[120px]">Wirtschaftsplan</TableHead>
                <TableHead className="text-right w-[120px]">Einnahmen/Ausgaben</TableHead>
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
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.total)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {acc.is_distributable ? formatCurrency(acc.total) : "–"}
                  </TableCell>
                </TableRow>
              ))}
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
          <Button size="sm" variant="outline" onClick={calculateClosingBalances} disabled={calculatingSalden}>
            {calculatingSalden ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Calculator className="h-4 w-4 mr-1" />}
            Salden berechnen
          </Button>
          <Button size="sm" variant="outline" onClick={generateAiSummary} disabled={generatingAiSummary}>
            {generatingAiSummary ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            KI-Zusammenfassung
          </Button>
          <Button size="sm" variant="outline" onClick={generatePdfs} disabled={generatingPdf || ownerResults.length === 0}>
            {generatingPdf ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            Alle PDFs
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={ownerResults.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
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
            {/* Anfangsbestände */}
            <div className="p-3 rounded-lg bg-muted/30 space-y-1">
              <div className="text-sm font-medium mb-1">Anfangsbestände zum {period ? new Date(period.period_from).toLocaleDateString("de-DE") : "–"}</div>
              <div className="flex justify-between text-sm">
                <span>Girokonto</span>
                <span className="font-mono">{formatCurrency(openingGiro)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Instandhaltungsrücklage</span>
                <span className="font-mono">{formatCurrency(openingReserve)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t pt-1">
                <span>Gesamt</span>
                <span className="font-mono">{formatCurrency(openingTotal)}</span>
              </div>
            </div>

            {/* Sections */}
            {SECTION_ORDER.map(section => renderSection(section))}

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
                <span className="font-mono">{formatCurrency(closingGiro)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Instandhaltungsrücklage</span>
                <span className="font-mono">{formatCurrency(closingReserve)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium border-t pt-1">
                <span>Gesamt</span>
                <span className="font-mono">{formatCurrency(closingTotal)}</span>
              </div>
            </div>

            {/* AI Summary */}
            {aiSummary && (
              <Card className="border-dashed border-primary/30 bg-primary/5">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> KI-Zusammenfassung
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm whitespace-pre-wrap">
                  {aiSummary}
                </CardContent>
              </Card>
            )}
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
                  <Button size="sm" variant="outline" onClick={() => generateOwnerPdf(selectedOwnerData.assignmentId, selectedOwnerData.name)} disabled={generatingPdf}>
                    <FileText className="h-4 w-4 mr-1" /> PDF
                  </Button>
                </div>

                {/* 7-column detail table */}
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
                      {selectedOwnerData.accountBreakdown.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{row.accountNumber}</TableCell>
                          <TableCell className="text-sm">{row.accountName}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(row.distributableAmount)}</TableCell>
                          <TableCell className="text-xs">{row.distKey}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatNum(row.totalShares)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatNum(row.ownerShare)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(row.ownerCost)}</TableCell>
                        </TableRow>
                      ))}
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
                              onClick={(e) => { e.stopPropagation(); generateOwnerPdf(owner.assignmentId, owner.name); }}
                              disabled={generatingPdf}>
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
    </Card>
  );
}
