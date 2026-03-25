import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart3, ChevronDown, ChevronRight, Download, Users, PiggyBank, AlertTriangle, Check, FileText, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BillingSettlementProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

const DIST_KEY_TO_SHARE: Record<string, string> = {
  mea: "mea",
  einheiten: "einheit",
  qm: "qm",
  personen: "personen",
  verbrauch_wasser: "wasser",
  verbrauch_warmwasser: "warmwasser",
  heizkostenverordnung: "heizkosten",
};

const SHARE_LABELS: Record<string, string> = {
  mea: "MEA (Miteigentumsanteile)",
  einheit: "Einheiten",
  qm: "Wohnfläche (m²)",
  personen: "Personen",
  wasser: "Wasserverbrauch",
  warmwasser: "Warmwasserverbrauch",
  heizkosten: "Heizkostenverordnung",
  direkt: "Direkte Zuordnung",
};

const COST_TYPE_LABELS: Record<string, string> = {
  hausgeld: "Hausgeld",
  ruecklage: "Rücklage",
  miete: "Miete",
  nebenkosten: "Nebenkosten",
};

export function BillingSettlement({ buildingId, periodId, fiscalYear }: BillingSettlementProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("overview");
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Period data
  const { data: period } = useQuery({
    queryKey: ["billing-period-settlement", periodId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_periods")
        .select("*")
        .eq("id", periodId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["billing-accounts", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("is_billing_relevant", true)
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // Account overrides for this building
  const { data: overrides = [] } = useQuery({
    queryKey: ["account-overrides", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_account_overrides")
        .select("*")
        .eq("building_id", buildingId);
      if (error) throw error;
      return data;
    },
  });

  // Bookings
  const { data: bookings = [] } = useQuery({
    queryKey: ["settlement-bookings", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, amount, booking_type, booking_category, description, is_35a_relevant")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  // Owners with shares and costs
  const { data: assignments = [] } = useQuery({
    queryKey: ["owner-assignments", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`
          *,
          contacts(id, first_name, last_name, company_name),
          contact_building_shares(*),
          contact_building_costs(*)
        `)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .in("role_in_building", ["eigentuemer", "mieter"]);
      if (error) throw error;
      return data;
    },
  });

  // Account balances for Vermögensbericht
  const { data: balances = [] } = useQuery({
    queryKey: ["account-balances-report", buildingId, fiscalYear],
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

  // Unpaid invoices for Verbindlichkeiten
  const { data: openInvoices = [] } = useQuery({
    queryKey: ["open-invoices", buildingId],
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

  const getDistKey = (accountId: string, defaultKey: string | null) => {
    const override = overrides.find((o) => o.account_id === accountId);
    return override?.distribution_key || defaultKey || "mea";
  };

  // Separate reserve accounts from operating costs
  const reserveAccounts = accounts.filter((a) => a.category === "ruecklage" || a.account_name.toLowerCase().includes("rücklage"));
  const operatingAccounts = accounts.filter((a) => !reserveAccounts.includes(a));

  const accountTotals = accounts.map((acc) => {
    const distKey = getDistKey(acc.id, acc.default_distribution_key);
    const total = bookings
      .filter((b) => b.account_id === acc.id && b.booking_category !== "heating_repost")
      .reduce((s, b) => s + Math.abs(Number(b.amount)), 0);
    return { ...acc, total, distKey };
  });

  // §35a relevant bookings
  const total35a = bookings
    .filter((b) => b.is_35a_relevant)
    .reduce((s, b) => s + Math.abs(Number(b.amount)), 0);

  const groupedByKey: Record<string, { accounts: typeof accountTotals; total: number }> = {};
  accountTotals.forEach((acc) => {
    if (acc.total === 0) return;
    if (!groupedByKey[acc.distKey]) groupedByKey[acc.distKey] = { accounts: [], total: 0 };
    groupedByKey[acc.distKey].accounts.push(acc);
    groupedByKey[acc.distKey].total += acc.total;
  });

  const totalCosts = accountTotals.reduce((s, a) => s + a.total, 0);
  const totalReserveCosts = accountTotals
    .filter((a) => reserveAccounts.some((r) => r.id === a.id))
    .reduce((s, a) => s + a.total, 0);
  const totalOperatingCosts = totalCosts - totalReserveCosts;

  const getShareTotal = (shareType: string) => {
    const mapped = DIST_KEY_TO_SHARE[shareType] || shareType;
    return assignments.reduce((s, a: any) => {
      const share = (a.contact_building_shares || []).find((sh: any) => sh.share_type === mapped);
      return s + (share ? Number(share.share_value) : 0);
    }, 0);
  };

  // Time-proportional calculation helper
  const getTimeProportion = (assignment: any) => {
    if (!period) return 1;
    const periodStart = new Date(period.period_from).getTime();
    const periodEnd = new Date(period.period_to).getTime();
    const totalDays = (periodEnd - periodStart) / (1000 * 60 * 60 * 24) + 1;

    const validFrom = assignment.valid_from ? new Date(assignment.valid_from).getTime() : periodStart;
    const validTo = assignment.valid_to ? new Date(assignment.valid_to).getTime() : periodEnd;

    const effectiveStart = Math.max(periodStart, validFrom);
    const effectiveEnd = Math.min(periodEnd, validTo);
    const effectiveDays = Math.max(0, (effectiveEnd - effectiveStart) / (1000 * 60 * 60 * 24) + 1);

    return effectiveDays / totalDays;
  };

  const ownerResults = assignments.map((assignment: any) => {
    const contact = assignment.contacts;
    const name = contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unbekannt";
    const shares = assignment.contact_building_shares || [];
    const costs = assignment.contact_building_costs || [];
    const timeProportion = getTimeProportion(assignment);

    let totalShare = 0;
    let share35a = 0;
    Object.entries(groupedByKey).forEach(([distKey, group]) => {
      const shareType = DIST_KEY_TO_SHARE[distKey] || distKey;
      const ownerShare = shares.find((s: any) => s.share_type === shareType);
      const totalShares = getShareTotal(distKey);
      if (ownerShare && totalShares > 0) {
        const proportion = (Number(ownerShare.share_value) / totalShares) * timeProportion;
        totalShare += group.total * proportion;

        // §35a proportional
        const group35a = group.accounts
          .filter((acc) => bookings.some((b) => b.account_id === acc.id && b.is_35a_relevant))
          .reduce((s, acc) => {
            const accBookings35a = bookings
              .filter((b) => b.account_id === acc.id && b.is_35a_relevant)
              .reduce((bs, b) => bs + Math.abs(Number(b.amount)), 0);
            return s + accBookings35a;
          }, 0);
        share35a += group35a * proportion;
      }
    });

    const annualHausgeld = costs
      .filter((c: any) => c.cost_type === "hausgeld" || c.cost_type === "nebenkosten")
      .reduce((s: number, c: any) => {
        const amount = Number(c.amount);
        switch (c.interval) {
          case "monatlich": return s + amount * 12;
          case "quartal": return s + amount * 4;
          case "jaehrlich": return s + amount;
          default: return s + amount * 12;
        }
      }, 0) * timeProportion;

    const annualReserve = costs
      .filter((c: any) => c.cost_type === "ruecklage")
      .reduce((s: number, c: any) => {
        const amount = Number(c.amount);
        switch (c.interval) {
          case "monatlich": return s + amount * 12;
          case "quartal": return s + amount * 4;
          case "jaehrlich": return s + amount;
          default: return s + amount * 12;
        }
      }, 0) * timeProportion;

    const totalPaid = annualHausgeld + annualReserve;
    const result = totalPaid - totalShare;

    // §35a calculation
    const haushaltsnaheDL = Math.min(share35a * 0.5, share35a); // Rough split: 50% household services
    const handwerkerleistungen = share35a - haushaltsnaheDL;
    const steuerbonus35a = Math.min(haushaltsnaheDL * 0.2, 4000) + Math.min(handwerkerleistungen * 0.2, 1200);

    return {
      assignmentId: assignment.id,
      contactId: contact?.id,
      name,
      unitNumber: assignment.unit_number || "–",
      shares,
      totalShare,
      annualHausgeld,
      annualReserve,
      totalPaid,
      result,
      timeProportion,
      share35a,
      steuerbonus35a,
    };
  });

  const totalPaidAll = ownerResults.reduce((s, o) => s + o.totalPaid, 0);
  const totalShareAll = ownerResults.reduce((s, o) => s + o.totalShare, 0);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  const formatNum = (n: number) =>
    new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);

  const toggleKey = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Vermögensbericht data
  const bankBalances = balances.filter((b: any) => b.chart_of_accounts?.carry_forward_balance);
  const totalBankBalance = bankBalances.reduce((s, b) => s + Number(b.closing_balance), 0);
  const reserveBalance = balances
    .filter((b: any) => b.chart_of_accounts?.category === "ruecklage")
    .reduce((s, b) => s + Number(b.closing_balance), 0);
  const totalOpenInvoices = openInvoices.reduce((s, inv: any) => s + Number(inv.gross_amount || 0), 0);

  const exportResults = () => {
    const lines: string[] = [];
    lines.push(`Gesamtabrechnung ${fiscalYear}`);
    lines.push("");
    lines.push("Einheit;Eigentümer;Kostenanteil;Hausgeld gezahlt;Rücklage gezahlt;Gesamt gezahlt;Ergebnis;§35a Anteil");
    ownerResults.forEach((o) => {
      const resultLabel = o.result >= 0 ? "Guthaben" : "Nachzahlung";
      lines.push([
        o.unitNumber,
        o.name,
        o.totalShare.toFixed(2).replace(".", ","),
        o.annualHausgeld.toFixed(2).replace(".", ","),
        o.annualReserve.toFixed(2).replace(".", ","),
        o.totalPaid.toFixed(2).replace(".", ","),
        `${o.result.toFixed(2).replace(".", ",")} (${resultLabel})`,
        o.share35a.toFixed(2).replace(".", ","),
      ].join(";"));
    });
    lines.push("");
    lines.push(`Gesamtkosten;;${totalCosts.toFixed(2).replace(".", ",")}`);

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Abrechnung_${fiscalYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Abrechnung exportiert");
  };

  const generatePdfs = async () => {
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-billing-pdf", {
        body: { buildingId, periodId, fiscalYear },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        toast.success("Gesamtabrechnung PDF erstellt");
      }
    } catch (e: any) {
      toast.error("Fehler bei PDF-Generierung: " + (e.message || "Unbekannter Fehler"));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const generateOwnerPdf = async (ownerId: string, ownerName: string) => {
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-billing-pdf", {
        body: { buildingId, periodId, fiscalYear, ownerId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
        toast.success(`Einzelabrechnung für ${ownerName} erstellt`);
      }
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannter Fehler"));
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Gesamtabrechnung {fiscalYear}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {accounts.length} abrechnungsrelevante Konten — Gesamtkosten: {formatCurrency(totalCosts)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={generatePdfs} disabled={generatingPdf || ownerResults.length === 0}>
            {generatingPdf ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
            Alle PDFs
          </Button>
          <Button size="sm" variant="outline" onClick={exportResults} disabled={ownerResults.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Keine Konten als abrechnungsrelevant markiert. Aktiviere "Abrechnungsrelevant" im Kontenrahmen.
          </p>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="overview">Kostenübersicht</TabsTrigger>
              <TabsTrigger value="owners">
                <Users className="h-4 w-4 mr-1" /> Eigentümer ({ownerResults.length})
              </TabsTrigger>
              <TabsTrigger value="assets">
                <Building2 className="h-4 w-4 mr-1" /> Vermögensbericht
              </TabsTrigger>
            </TabsList>

            {/* Kostenübersicht nach Verteilerschlüssel */}
            <TabsContent value="overview" className="space-y-3">
              {Object.entries(groupedByKey).map(([distKey, group]) => {
                const isExpanded = expandedKeys.has(distKey);
                const shareTotal = getShareTotal(distKey);
                return (
                  <Collapsible key={distKey} open={isExpanded} onOpenChange={() => toggleKey(distKey)}>
                    <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted text-left">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-medium text-sm">{SHARE_LABELS[distKey] || distKey}</span>
                        <Badge variant="outline" className="text-xs">{group.accounts.length} Konten</Badge>
                        {shareTotal > 0 && (
                          <Badge variant="outline" className="text-xs">Σ Anteile: {formatNum(shareTotal)}</Badge>
                        )}
                      </div>
                      <span className="font-mono font-medium text-sm">{formatCurrency(group.total)}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">Konto</TableHead>
                            <TableHead>Bezeichnung</TableHead>
                            <TableHead className="text-right">Betrag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.accounts.map((acc) => (
                            <TableRow key={acc.id}>
                              <TableCell className="font-mono text-xs">{acc.account_number}</TableCell>
                              <TableCell className="text-sm">{acc.account_name}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Summary */}
              <div className="space-y-2 mt-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <span className="text-sm">Betriebskosten</span>
                  <span className="font-mono text-sm">{formatCurrency(totalOperatingCosts)}</span>
                </div>
                {totalReserveCosts > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-sm">Rücklagenzuführung</span>
                    <span className="font-mono text-sm">{formatCurrency(totalReserveCosts)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border-2 border-primary/20">
                  <span className="font-semibold text-sm">Gesamtkosten</span>
                  <span className="font-mono font-bold">{formatCurrency(totalCosts)}</span>
                </div>
                {total35a > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-sm text-muted-foreground">davon §35a EStG-relevant</span>
                    <span className="font-mono text-sm text-muted-foreground">{formatCurrency(total35a)}</span>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Eigentümer-Abrechnung */}
            <TabsContent value="owners">
              {ownerResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Keine Eigentümer/Mieter mit aktiven Zuordnungen gefunden. Bitte weise Kontakte mit Anteilen dem Gebäude zu.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      <PiggyBank className="h-3 w-3 mr-1" />
                      Hausgeld gesamt: {formatCurrency(totalPaidAll)}
                    </Badge>
                    <Badge variant="outline">Kosten verteilt: {formatCurrency(totalShareAll)}</Badge>
                    {Math.abs(totalPaidAll - totalShareAll) > 0.01 && (
                      <Badge className={totalPaidAll > totalShareAll ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                        {totalPaidAll > totalShareAll ? "Überschuss" : "Fehlbetrag"}: {formatCurrency(Math.abs(totalPaidAll - totalShareAll))}
                      </Badge>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Einheit</TableHead>
                          <TableHead>Eigentümer</TableHead>
                          <TableHead className="text-right">Kostenanteil</TableHead>
                          <TableHead className="text-right">Hausgeld</TableHead>
                          <TableHead className="text-right">Rücklage</TableHead>
                          <TableHead className="text-right">Ergebnis</TableHead>
                          {total35a > 0 && <TableHead className="text-right">§35a</TableHead>}
                          <TableHead className="w-[80px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ownerResults.map((owner) => (
                          <TableRow key={owner.assignmentId}>
                            <TableCell className="text-sm font-medium">
                              {owner.unitNumber}
                              {owner.timeProportion < 1 && (
                                <Badge variant="outline" className="ml-1 text-[10px]">
                                  {Math.round(owner.timeProportion * 100)}%
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{owner.name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatCurrency(owner.totalShare)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(owner.annualHausgeld)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(owner.annualReserve)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium">
                              {owner.result >= 0 ? (
                                <span className="text-green-700 flex items-center justify-end gap-1">
                                  <Check className="h-3 w-3" />
                                  {formatCurrency(owner.result)}
                                </span>
                              ) : (
                                <span className="text-red-700 flex items-center justify-end gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {formatCurrency(owner.result)}
                                </span>
                              )}
                            </TableCell>
                            {total35a > 0 && (
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                {formatCurrency(owner.share35a)}
                              </TableCell>
                            )}
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => generateOwnerPdf(owner.assignmentId, owner.name)}
                                disabled={generatingPdf}
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-medium border-t-2">
                          <TableCell></TableCell>
                          <TableCell>Gesamt</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(totalShareAll)}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(ownerResults.reduce((s, o) => s + o.annualHausgeld, 0))}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(ownerResults.reduce((s, o) => s + o.annualReserve, 0))}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(ownerResults.reduce((s, o) => s + o.result, 0))}
                          </TableCell>
                          {total35a > 0 && (
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {formatCurrency(ownerResults.reduce((s, o) => s + o.share35a, 0))}
                            </TableCell>
                          )}
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Vermögensbericht (§28 WEG) */}
            <TabsContent value="assets" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Gemäß §28 WEG — Darstellung der Vermögenslage der Eigentümergemeinschaft zum Ende des Abrechnungszeitraums.
              </p>

              {/* Bankkonten */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Bankkonten & Liquidität</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {bankBalances.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Konto</TableHead>
                          <TableHead>Bezeichnung</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bankBalances.map((b: any) => (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-xs">{b.chart_of_accounts?.account_number}</TableCell>
                            <TableCell className="text-sm">{b.chart_of_accounts?.account_name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatCurrency(Number(b.closing_balance))}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-medium border-t-2">
                          <TableCell colSpan={2}>Gesamtliquidität</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(totalBankBalance)}</TableCell>
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
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {balances
                      .filter((b: any) => b.chart_of_accounts?.category === "ruecklage")
                      .map((b: any) => {
                        const zuführung = totalReserveCosts;
                        return (
                          <div key={b.id} className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Anfangsbestand</span>
                              <span className="font-mono">{formatCurrency(Number(b.opening_balance))}</span>
                            </div>
                            <div className="flex justify-between text-green-700">
                              <span>+ Zuführungen</span>
                              <span className="font-mono">{formatCurrency(zuführung)}</span>
                            </div>
                            <div className="flex justify-between font-medium border-t pt-1">
                              <span>Endbestand</span>
                              <span className="font-mono">{formatCurrency(Number(b.closing_balance))}</span>
                            </div>
                          </div>
                        );
                      })}
                    {balances.filter((b: any) => b.chart_of_accounts?.category === "ruecklage").length === 0 && (
                      <p className="text-sm text-muted-foreground py-2 text-center">Keine Rücklagenkonten gefunden.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Verbindlichkeiten */}
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
                          <TableCell className="text-right font-mono">{formatCurrency(totalOpenInvoices)}</TableCell>
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
                    <span className="font-mono font-medium">{formatCurrency(totalBankBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>davon Rücklagen</span>
                    <span className="font-mono text-muted-foreground">{formatCurrency(reserveBalance)}</span>
                  </div>
                  {totalOpenInvoices > 0 && (
                    <div className="flex justify-between text-red-700">
                      <span>./. offene Verbindlichkeiten</span>
                      <span className="font-mono">{formatCurrency(-totalOpenInvoices)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-2">
                    <span>Verfügbare Mittel</span>
                    <span className="font-mono">{formatCurrency(totalBankBalance - totalOpenInvoices)}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
