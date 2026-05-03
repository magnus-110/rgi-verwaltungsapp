import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sparkles, Loader2, Check, Save, ChevronDown, ChevronRight, Info, FileText, Shield, PiggyBank, Users, Eye } from "lucide-react";
import { Fragment } from "react";
import { toast } from "sonner";
import { EconomicPlanPreview } from "./EconomicPlanPreview";
import { sumForAccount, getEffectiveClosingBalance } from "./lib/bookingAggregation";

interface EconomicPlanEditorProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

const STEPS = [
  { id: "gesamt", label: "Gesamtwirtschaftsplan", description: "Voraussichtliche Bewirtschaftungskosten nach Kostenarten planen", icon: FileText },
  { id: "ruecklage", label: "Erhaltungsrücklage", description: "Zuführung zur Erhaltungsrücklage gem. §19 Abs. 2 Nr. 4 WEG festlegen", icon: PiggyBank },
  { id: "einzel", label: "Einzelwirtschaftspläne", description: "Hausgeld-Vorschüsse pro Eigentümer gem. §28 Abs. 1 WEG berechnen", icon: Users },
  { id: "genehmigung", label: "Genehmigung & Export", description: "Wirtschaftsplan genehmigen und als PDF exportieren", icon: Shield },
];

export function EconomicPlanEditor({ buildingId, periodId, fiscalYear }: EconomicPlanEditorProps) {
  const queryClient = useQueryClient();
  const planYear = fiscalYear + 1;
  const [generating, setGenerating] = useState(false);
  const [editedAmounts, setEditedAmounts] = useState<Record<string, number>>({});
  const [editedReserve, setEditedReserve] = useState<number | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(["gesamt"]));
  const [previewMode, setPreviewMode] = useState<"gesamt" | "einzel" | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Building info
  const { data: building } = useQuery({
    queryKey: ["building-info", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("name, address, manager_name")
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Existing plan
  const { data: existingPlan, isLoading: loadingPlan } = useQuery({
    queryKey: ["economic-plan", buildingId, planYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("economic_plans" as any)
        .select("*, economic_plan_items(*)")
        .eq("building_id", buildingId)
        .eq("fiscal_year", planYear)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // WP-relevant accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["wp-accounts-plan", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("is_wirtschaftsplan_relevant", true)
        .or(`building_id.is.null,building_id.eq.${buildingId}`)
        .order("account_number");
      if (error) throw error;
      return data;
    },
  });

  // Building-specific distribution-key overrides
  const { data: accountOverrides = [] } = useQuery({
    queryKey: ["building-account-overrides", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("building_account_overrides")
        .select("account_id, distribution_key")
        .eq("building_id", buildingId);
      if (error) throw error;
      return data || [];
    },
  });
  const overrideKeyByAccount = new Map<string, string>(
    accountOverrides.filter((o: any) => o.distribution_key).map((o: any) => [o.account_id, o.distribution_key])
  );

  // Previous year bookings — include counter_account_id for bank-centric aggregation
  const { data: prevBookings = [] } = useQuery({
    queryKey: ["prev-bookings-plan", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, counter_account_id, amount")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  // Owner assignments
  const { data: assignments = [] } = useQuery({
    queryKey: ["plan-assignments", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_building_assignments")
        .select(`
          *,
          contacts(first_name, last_name, company_name),
          contact_building_shares(*),
          contact_building_costs(*)
        `)
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .in("role_in_building", ["eigentuemer"]);
      if (error) throw error;
      return data;
    },
  });

  // Current reserve balance — robust via settlement_section='reserve' + Helper
  // (Anfangsbestand aus Eröffnungsbuchung 4000 + Bewegungen)
  const { data: reserveBalance } = useQuery({
    queryKey: ["reserve-balance", buildingId, fiscalYear],
    queryFn: async () => {
      const { data: balances, error: bErr } = await supabase
        .from("account_balances")
        .select("account_id, opening_balance, closing_balance")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear);
      if (bErr) throw bErr;

      const { data: accs, error: aErr } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number, account_name, settlement_section, category")
        .or(`building_id.is.null,building_id.eq.${buildingId}`);
      if (aErr) throw aErr;

      const reserveAccs = (accs || []).filter((a: any) =>
        a.settlement_section === "reserve" ||
        a.category === "ruecklage" ||
        a.account_name?.toLowerCase().includes("rücklage") ||
        a.account_name?.toLowerCase().includes("rucklage") ||
        a.account_name?.toLowerCase().includes("erhaltung"),
      );
      if (reserveAccs.length === 0) return 0;

      const opening4000 = (accs || []).find((a: any) => a.account_number === "4000");
      const opening4000Id = opening4000?.id || null;

      const flatBalances = (balances || []).map((b: any) => ({
        account_id: b.account_id,
        opening_balance: b.opening_balance,
      }));

      return reserveAccs.reduce((s: number, acc: any) => {
        const eff = getEffectiveClosingBalance(
          acc.id,
          prevBookings as any,
          flatBalances,
          fiscalYear,
          opening4000Id,
        );
        return s + eff.amount;
      }, 0);
    },
    enabled: prevBookings.length > 0,
  });

  const items: any[] = existingPlan?.economic_plan_items || [];

  // Group accounts by category — bank-zentrisch via Helper (Haupt- und Gegenkonto)
  const prevYearTotals = accounts.map((acc) => {
    const total = sumForAccount(acc.id, prevBookings as any);
    return { ...acc, previousAmount: Math.abs(total) };
  }).filter((a) => a.previousAmount > 0 || items.some((i: any) => i.account_id === a.id));

  const categoryGroups = prevYearTotals.reduce<Record<string, typeof prevYearTotals>>((groups, acc) => {
    const cat = acc.category || "Sonstige";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(acc);
    return groups;
  }, {});

  const getPlannedAmount = (accountId: string, previousAmount: number) => {
    if (editedAmounts[accountId] !== undefined) return editedAmounts[accountId];
    const item = items.find((i: any) => i.account_id === accountId);
    return item ? Number(item.planned_amount) : previousAmount;
  };

  const getReason = (accountId: string) => {
    const item = items.find((i: any) => i.account_id === accountId);
    return item?.adjustment_reason || "";
  };

  const totalPlanned = prevYearTotals.reduce((s, a) => s + getPlannedAmount(a.id, a.previousAmount), 0);
  const totalPrevious = prevYearTotals.reduce((s, a) => s + a.previousAmount, 0);

  const plannedReserve = editedReserve ?? (existingPlan?.total_reserve ? Number(existingPlan.total_reserve) : 0);
  const totalWithReserve = totalPlanned + plannedReserve;

  // MEA calculations
  const meaTotal = assignments.reduce((s, a: any) => {
    const mea = (a.contact_building_shares || []).find((sh: any) => sh.share_type === "mea");
    return s + (mea ? Number(mea.share_value) : 0);
  }, 0);

  const ownerPlans = assignments.map((a: any) => {
    const contact = a.contacts;
    const name = contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "–";
    const mea = (a.contact_building_shares || []).find((sh: any) => sh.share_type === "mea");
    const meaValue = mea ? Number(mea.share_value) : 0;
    const proportion = meaTotal > 0 ? meaValue / meaTotal : 0;

    const annualCosts = totalPlanned * proportion;
    const annualReserve = plannedReserve * proportion;
    const annualTotal = annualCosts + annualReserve;
    const monthlyHausgeld = annualTotal / 12;

    const currentCosts = (a.contact_building_costs || [])
      .filter((c: any) => c.cost_type === "hausgeld" || c.cost_type === "nebenkosten")
      .reduce((s: number, c: any) => s + Number(c.amount), 0);

    return { name, unitNumber: a.unit_number || "–", meaValue, annualCosts, annualReserve, annualTotal, monthlyHausgeld, currentHausgeld: currentCosts };
  });

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.has(stepId) ? next.delete(stepId) : next.add(stepId);
      return next;
    });
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const generateWithAI = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-economic-plan", {
        body: { buildingId, periodId, fiscalYear, planYear },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["economic-plan", buildingId, planYear] });
      setEditedAmounts({});
      toast.success("Vorschlag generiert");
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannter Fehler"));
    } finally {
      setGenerating(false);
    }
  };

  const savePlan = useMutation({
    mutationFn: async () => {
      const planData = {
        building_id: buildingId,
        fiscal_year: planYear,
        based_on_period_id: periodId,
        total_costs: totalPlanned,
        total_reserve: plannedReserve,
        status: existingPlan?.status || "draft",
      };

      let planId = existingPlan?.id;
      if (planId) {
        await supabase.from("economic_plans" as any).update(planData as any).eq("id", planId);
      } else {
        const { data, error } = await supabase.from("economic_plans" as any).insert(planData as any).select("id").single();
        if (error) throw error;
        planId = (data as any).id;
      }

      for (const acc of prevYearTotals) {
        const planned = getPlannedAmount(acc.id, acc.previousAmount);
        const effKey = overrideKeyByAccount.get(acc.id) || (acc as any).default_distribution_key || "mea";
        const existing = items.find((i: any) => i.account_id === acc.id);
        if (existing) {
          await supabase.from("economic_plan_items" as any).update({
            planned_amount: planned,
            previous_amount: acc.previousAmount,
            distribution_key: effKey,
          } as any).eq("id", existing.id);
        } else {
          await supabase.from("economic_plan_items" as any).insert({
            plan_id: planId,
            account_id: acc.id,
            previous_amount: acc.previousAmount,
            planned_amount: planned,
            distribution_key: effKey,
          } as any);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["economic-plan"] });
      toast.success("Wirtschaftsplan gespeichert");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const approvePlan = useMutation({
    mutationFn: async () => {
      if (!existingPlan?.id) throw new Error("Bitte zuerst speichern");
      await supabase.from("economic_plans" as any).update({
        status: "approved",
        approved_at: new Date().toISOString(),
      } as any).eq("id", existingPlan.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["economic-plan"] });
      toast.success("Wirtschaftsplan genehmigt");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (loadingPlan) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header with status */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Wirtschaftsplan {planYear}</h2>
          {existingPlan && (
            <Badge variant={existingPlan.status === "approved" ? "default" : "outline"}>
              {existingPlan.status === "approved" ? "Genehmigt" : existingPlan.status === "active" ? "Aktiv" : "Entwurf"}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Basierend auf Abrechnung {fiscalYear}</p>
      </div>

      {/* Guide */}
      <Collapsible open={showGuide} onOpenChange={setShowGuide}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
          <Info className="h-4 w-4" />
          <span>Anleitung: Wirtschaftsplan erstellen</span>
          {showGuide ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="pt-4">
              <ol className="space-y-3 text-sm">
                {STEPS.map((step, i) => (
                  <li key={step.id} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">{i + 1}</span>
                    <div>
                      <span className="font-medium">{step.label}</span>
                      <span className="text-muted-foreground ml-1">– {step.description}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground mt-4 border-t pt-3">
                Der Wirtschaftsplan besteht aus Gesamtwirtschaftsplan (alle Kosten der Gemeinschaft) und Einzelwirtschaftsplänen (Hausgeld pro Eigentümer) gem. §28 WEG.
              </p>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Steps */}
      {STEPS.map((step, index) => {
        const isExpanded = expandedSteps.has(step.id);
        const StepIcon = step.icon;
        return (
          <Card key={step.id} className="overflow-hidden">
            <button
              onClick={() => toggleStep(step.id)}
              className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 text-left transition-colors"
            >
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                {index + 1}
              </span>
              <StepIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{step.label}</span>
                {!isExpanded && (
                  <span className="text-xs text-muted-foreground ml-2 hidden md:inline">{step.description}</span>
                )}
              </div>
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t">
                <div className="pt-4">
                  {step.id === "gesamt" && (
                    <GesamtplanStep
                      categoryGroups={categoryGroups}
                      prevYearTotals={prevYearTotals}
                      getPlannedAmount={getPlannedAmount}
                      getReason={getReason}
                      setEditedAmounts={setEditedAmounts}
                      totalPrevious={totalPrevious}
                      totalPlanned={totalPlanned}
                      fiscalYear={fiscalYear}
                      planYear={planYear}
                      formatCurrency={formatCurrency}
                      generating={generating}
                      onGenerate={generateWithAI}
                      onSave={() => savePlan.mutate()}
                      saving={savePlan.isPending}
                    />
                  )}
                  {step.id === "ruecklage" && (
                    <RuecklageStep
                      plannedReserve={plannedReserve}
                      reserveBalance={reserveBalance ?? 0}
                      onReserveChange={setEditedReserve}
                      formatCurrency={formatCurrency}
                      planYear={planYear}
                    />
                  )}
                  {step.id === "einzel" && (
                    <EinzelplanStep
                      ownerPlans={ownerPlans}
                      formatCurrency={formatCurrency}
                      totalWithReserve={totalWithReserve}
                      planYear={planYear}
                    />
                  )}
                  {step.id === "genehmigung" && (
                    <GenehmigungenStep
                      existingPlan={existingPlan}
                      onSave={() => savePlan.mutate()}
                      onApprove={() => approvePlan.mutate()}
                      saving={savePlan.isPending}
                      approving={approvePlan.isPending}
                      formatCurrency={formatCurrency}
                      totalPlanned={totalPlanned}
                      plannedReserve={plannedReserve}
                      totalWithReserve={totalWithReserve}
                      ownerCount={ownerPlans.length}
                    />
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Floating Preview Buttons */}
      {(prevYearTotals.length > 0 || existingPlan) && (
        <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-40">
          <Button
            size="sm"
            variant="outline"
            className="shadow-lg bg-background"
            onClick={() => setPreviewMode("gesamt")}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            Gesamtplan
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="shadow-lg bg-background"
            onClick={() => setPreviewMode("einzel")}
            disabled={ownerPlans.length === 0}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            Einzelplan
          </Button>
        </div>
      )}

      {/* Preview Dialog */}
      <EconomicPlanPreview
        open={previewMode !== null}
        onOpenChange={(open) => !open && setPreviewMode(null)}
        mode={previewMode || "gesamt"}
        planYear={planYear}
        fiscalYear={fiscalYear}
        building={building ?? null}
        categoryGroups={categoryGroups}
        getPlannedAmount={getPlannedAmount}
        totalPrevious={totalPrevious}
        totalPlanned={totalPlanned}
        plannedReserve={plannedReserve}
        totalWithReserve={totalWithReserve}
        ownerPlans={ownerPlans}
      />
    </div>
  );
}

// ─── Step 1: Gesamtwirtschaftsplan ────────────────────────────────────────────

interface GesamtplanStepProps {
  categoryGroups: Record<string, any[]>;
  prevYearTotals: any[];
  getPlannedAmount: (id: string, prev: number) => number;
  getReason: (id: string) => string;
  setEditedAmounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  totalPrevious: number;
  totalPlanned: number;
  fiscalYear: number;
  planYear: number;
  formatCurrency: (n: number) => string;
  generating: boolean;
  onGenerate: () => void;
  onSave: () => void;
  saving: boolean;
}

function GesamtplanStep({
  categoryGroups, prevYearTotals, getPlannedAmount, getReason, setEditedAmounts,
  totalPrevious, totalPlanned, fiscalYear, planYear, formatCurrency,
  generating, onGenerate, onSave, saving,
}: GesamtplanStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Planen Sie die voraussichtlichen Bewirtschaftungskosten für {planYear} basierend auf den Ist-Werten aus {fiscalYear}.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Vorschlag generieren
          </Button>
          <Button size="sm" variant="outline" onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> Speichern
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Konto</TableHead>
              <TableHead>Bezeichnung</TableHead>
              <TableHead className="text-right">Ist {fiscalYear}</TableHead>
              <TableHead className="text-right w-[140px]">Plan {planYear}</TableHead>
              <TableHead className="text-right w-[80px]">Δ %</TableHead>
              <TableHead className="hidden md:table-cell">Begründung</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(categoryGroups).map(([category, accs]) => (
              <Fragment key={`cat-${category}`}>
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={6} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground py-2">
                    {category}
                  </TableCell>
                </TableRow>
                {accs.map((acc) => {
                  const planned = getPlannedAmount(acc.id, acc.previousAmount);
                  const delta = acc.previousAmount > 0 ? ((planned - acc.previousAmount) / acc.previousAmount) * 100 : 0;
                  return (
                    <TableRow key={acc.id}>
                      <TableCell className="font-mono text-xs">{acc.account_number}</TableCell>
                      <TableCell className="text-sm">{acc.account_name}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(acc.previousAmount)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="w-[120px] ml-auto text-right font-mono text-sm h-8"
                          value={planned.toFixed(2)}
                          onChange={(e) => setEditedAmounts((prev) => ({ ...prev, [acc.id]: Number(e.target.value) }))}
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {delta !== 0 && (
                          <span className={delta > 0 ? "text-destructive" : "text-green-600"}>
                            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {getReason(acc.id)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}
            <TableRow className="font-medium border-t-2">
              <TableCell></TableCell>
              <TableCell>Bewirtschaftungskosten gesamt</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totalPrevious)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(totalPlanned)}</TableCell>
              <TableCell className="text-right text-xs">
                {totalPrevious > 0 && (
                  <span className={totalPlanned > totalPrevious ? "text-destructive" : "text-green-600"}>
                    {((totalPlanned - totalPrevious) / totalPrevious * 100) > 0 ? "+" : ""}
                    {((totalPlanned - totalPrevious) / totalPrevious * 100).toFixed(1)}%
                  </span>
                )}
              </TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Step 2: Erhaltungsrücklage ───────────────────────────────────────────────

interface RuecklageStepProps {
  plannedReserve: number;
  reserveBalance: number;
  onReserveChange: (v: number) => void;
  formatCurrency: (n: number) => string;
  planYear: number;
}

function RuecklageStep({ plannedReserve, reserveBalance, onReserveChange, formatCurrency, planYear }: RuecklageStepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Legen Sie die jährliche Zuführung zur Erhaltungsrücklage gem. §19 Abs. 2 Nr. 4 WEG fest.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Aktueller Rücklagenstand</p>
            <p className="text-xl font-bold font-mono">{formatCurrency(reserveBalance)}</p>
            <p className="text-xs text-muted-foreground mt-1">per Ende Vorjahr</p>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Geplante Zuführung {planYear}</p>
            <Input
              type="number"
              className="text-xl font-bold font-mono h-10 mt-1"
              value={plannedReserve.toFixed(2)}
              onChange={(e) => onReserveChange(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground mt-1">jährliche Zuführung</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-1">Prognostizierter Stand Ende {planYear}</p>
            <p className="text-xl font-bold font-mono">{formatCurrency(reserveBalance + plannedReserve)}</p>
            <p className="text-xs text-muted-foreground mt-1">nach Zuführung</p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
        <p className="font-medium mb-1">Hinweis zur Erhaltungsrücklage</p>
        <p>Die Zuführung zur Erhaltungsrücklage wird zusätzlich zu den Bewirtschaftungskosten auf die Eigentümer umgelegt und ist Bestandteil des monatlichen Hausgeldes.</p>
      </div>
    </div>
  );
}

// ─── Step 3: Einzelwirtschaftspläne ───────────────────────────────────────────

interface EinzelplanStepProps {
  ownerPlans: {
    name: string;
    unitNumber: string;
    meaValue: number;
    annualCosts: number;
    annualReserve: number;
    annualTotal: number;
    monthlyHausgeld: number;
    currentHausgeld: number;
  }[];
  formatCurrency: (n: number) => string;
  totalWithReserve: number;
  planYear: number;
}

function EinzelplanStep({ ownerPlans, formatCurrency, totalWithReserve, planYear }: EinzelplanStepProps) {
  if (ownerPlans.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Keine Eigentümer zugewiesen. Bitte weisen Sie zunächst Eigentümer mit MEA-Anteilen in der Kontaktverwaltung zu.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Hausgeld-Vorschüsse gem. §28 Abs. 1 WEG – monatliche Zahlungspflicht je Eigentümer für {planYear}.
      </p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Einheit</TableHead>
              <TableHead>Eigentümer</TableHead>
              <TableHead className="text-right">MEA</TableHead>
              <TableHead className="text-right">Bewirt.-Kosten/Jahr</TableHead>
              <TableHead className="text-right">Rücklage/Jahr</TableHead>
              <TableHead className="text-right">Gesamt/Jahr</TableHead>
              <TableHead className="text-right font-semibold">Hausgeld/Monat</TableHead>
              <TableHead className="text-right">Aktuell/Monat</TableHead>
              <TableHead className="text-right">Differenz</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ownerPlans.map((o, i) => {
              const diff = o.monthlyHausgeld - o.currentHausgeld;
              return (
                <TableRow key={i}>
                  <TableCell className="text-sm">{o.unitNumber}</TableCell>
                  <TableCell className="text-sm font-medium">{o.name}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{o.meaValue.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(o.annualCosts)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(o.annualReserve)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCurrency(o.annualTotal)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(o.monthlyHausgeld)}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(o.currentHausgeld)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <span className={diff > 0 ? "text-destructive" : diff < 0 ? "text-green-600" : ""}>
                      {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="font-medium border-t-2">
              <TableCell colSpan={3}>Gesamt</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(ownerPlans.reduce((s, o) => s + o.annualCosts, 0))}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(ownerPlans.reduce((s, o) => s + o.annualReserve, 0))}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(ownerPlans.reduce((s, o) => s + o.annualTotal, 0))}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatCurrency(ownerPlans.reduce((s, o) => s + o.monthlyHausgeld, 0))}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {formatCurrency(ownerPlans.reduce((s, o) => s + o.currentHausgeld, 0))}
              </TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Step 4: Genehmigung & Export ─────────────────────────────────────────────

interface GenehmigungenStepProps {
  existingPlan: any;
  onSave: () => void;
  onApprove: () => void;
  saving: boolean;
  approving: boolean;
  formatCurrency: (n: number) => string;
  totalPlanned: number;
  plannedReserve: number;
  totalWithReserve: number;
  ownerCount: number;
}

function GenehmigungenStep({
  existingPlan, onSave, onApprove, saving, approving,
  formatCurrency, totalPlanned, plannedReserve, totalWithReserve, ownerCount,
}: GenehmigungenStepProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Prüfen Sie die Zusammenfassung und genehmigen Sie den Wirtschaftsplan.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Bewirtschaftungskosten</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCurrency(totalPlanned)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Erhaltungsrücklage</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCurrency(plannedReserve)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Gesamtkosten</p>
            <p className="text-lg font-bold font-mono mt-1">{formatCurrency(totalWithReserve)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">Eigentümer</p>
            <p className="text-lg font-bold mt-1">{ownerCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status & Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          {existingPlan ? (
            <Badge variant={existingPlan.status === "approved" ? "default" : "outline"}>
              {existingPlan.status === "approved" ? "Genehmigt" : "Entwurf"}
            </Badge>
          ) : (
            <Badge variant="outline">Nicht gespeichert</Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> Speichern
          </Button>
          {(!existingPlan || existingPlan.status === "draft") && (
            <Button size="sm" onClick={onApprove} disabled={approving || !existingPlan}>
              <Check className="h-4 w-4 mr-1" /> Genehmigen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
