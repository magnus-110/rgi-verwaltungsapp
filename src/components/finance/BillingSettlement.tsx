import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart3, ChevronDown, ChevronRight, Download, Users, PiggyBank, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";

interface BillingSettlementProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

// Map account distribution keys to share_type enum values
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
        .select("account_id, amount, booking_type, booking_category, description")
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

  // Get distribution key for an account (override > default)
  const getDistKey = (accountId: string, defaultKey: string | null) => {
    const override = overrides.find((o) => o.account_id === accountId);
    return override?.distribution_key || defaultKey || "mea";
  };

  // Calculate account totals
  const accountTotals = accounts.map((acc) => {
    const distKey = getDistKey(acc.id, acc.default_distribution_key);
    const total = bookings
      .filter((b) => b.account_id === acc.id && b.booking_category !== "heating_repost")
      .reduce((s, b) => s + Math.abs(Number(b.amount)), 0);
    return { ...acc, total, distKey };
  });

  // Group by distribution key
  const groupedByKey: Record<string, { accounts: typeof accountTotals; total: number }> = {};
  accountTotals.forEach((acc) => {
    if (acc.total === 0) return;
    if (!groupedByKey[acc.distKey]) groupedByKey[acc.distKey] = { accounts: [], total: 0 };
    groupedByKey[acc.distKey].accounts.push(acc);
    groupedByKey[acc.distKey].total += acc.total;
  });

  const totalCosts = accountTotals.reduce((s, a) => s + a.total, 0);

  // Total shares per key
  const getShareTotal = (shareType: string) => {
    const mapped = DIST_KEY_TO_SHARE[shareType] || shareType;
    return assignments.reduce((s, a: any) => {
      const share = (a.contact_building_shares || []).find((sh: any) => sh.share_type === mapped);
      return s + (share ? Number(share.share_value) : 0);
    }, 0);
  };

  // Calculate per-owner distribution
  const ownerResults = assignments.map((assignment: any) => {
    const contact = assignment.contacts;
    const name = contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unbekannt";
    const shares = assignment.contact_building_shares || [];
    const costs = assignment.contact_building_costs || [];

    // Calculate cost share per distribution key
    let totalShare = 0;
    Object.entries(groupedByKey).forEach(([distKey, group]) => {
      const shareType = DIST_KEY_TO_SHARE[distKey] || distKey;
      const ownerShare = shares.find((s: any) => s.share_type === shareType);
      const totalShares = getShareTotal(distKey);
      if (ownerShare && totalShares > 0) {
        const proportion = Number(ownerShare.share_value) / totalShares;
        totalShare += group.total * proportion;
      }
    });

    // Calculate annual Hausgeld paid
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
      }, 0);

    // Rücklage
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
      }, 0);

    const totalPaid = annualHausgeld + annualReserve;
    const result = totalPaid - totalShare; // positive = credit, negative = additional payment

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

  // Export per-owner results
  const exportResults = () => {
    const lines: string[] = [];
    lines.push(`Gesamtabrechnung ${fiscalYear}`);
    lines.push("");
    lines.push("Einheit;Eigentümer;Kostenanteil;Hausgeld gezahlt;Rücklage gezahlt;Gesamt gezahlt;Ergebnis");
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Gesamtabrechnung {fiscalYear}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {accounts.length} abrechnungsrelevante Konten — Gesamtkosten: {formatCurrency(totalCosts)}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={exportResults} disabled={ownerResults.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Keine Konten als abrechnungsrelevant markiert. Aktiviere "Abrechnungsrelevant" im Kontenrahmen.
          </p>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Kostenübersicht</TabsTrigger>
              <TabsTrigger value="owners">
                <Users className="h-4 w-4 mr-1" /> Eigentümer ({ownerResults.length})
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

              {/* Gesamtsumme */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border-2 border-primary/20">
                <span className="font-semibold text-sm">Gesamtkosten</span>
                <span className="font-mono font-bold">{formatCurrency(totalCosts)}</span>
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
                  {/* Summary badges */}
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

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Einheit</TableHead>
                        <TableHead>Eigentümer</TableHead>
                        <TableHead className="text-right">Kostenanteil</TableHead>
                        <TableHead className="text-right">Hausgeld</TableHead>
                        <TableHead className="text-right">Rücklage</TableHead>
                        <TableHead className="text-right">Ergebnis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ownerResults.map((owner) => (
                        <TableRow key={owner.assignmentId}>
                          <TableCell className="text-sm font-medium">{owner.unitNumber}</TableCell>
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
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
