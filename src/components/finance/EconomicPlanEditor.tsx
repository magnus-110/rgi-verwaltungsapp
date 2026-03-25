import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Loader2, Check, FileText, Save } from "lucide-react";
import { toast } from "sonner";

interface EconomicPlanEditorProps {
  buildingId: string;
  periodId: string;
  fiscalYear: number;
}

export function EconomicPlanEditor({ buildingId, periodId, fiscalYear }: EconomicPlanEditorProps) {
  const queryClient = useQueryClient();
  const planYear = fiscalYear + 1;
  const [generating, setGenerating] = useState(false);
  const [editedAmounts, setEditedAmounts] = useState<Record<string, number>>({});

  // Check for existing plan
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

  // Accounts for reference
  const { data: accounts = [] } = useQuery({
    queryKey: ["billing-accounts-plan", buildingId],
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

  // Previous year bookings
  const { data: prevBookings = [] } = useQuery({
    queryKey: ["prev-bookings-plan", buildingId, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("account_id, amount")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYear)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });

  // Owner assignments for Hausgeld calculation
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

  const prevYearTotals = accounts.map((acc) => {
    const total = prevBookings
      .filter((b) => b.account_id === acc.id)
      .reduce((s, b) => s + Math.abs(Number(b.amount)), 0);
    return { ...acc, previousAmount: total };
  }).filter((a) => a.previousAmount > 0 || (existingPlan?.economic_plan_items || []).some((i: any) => i.account_id === a.id));

  const items: any[] = existingPlan?.economic_plan_items || [];

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

  const generateWithAI = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-economic-plan", {
        body: { buildingId, periodId, fiscalYear, planYear },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["economic-plan", buildingId, planYear] });
      setEditedAmounts({});
      toast.success("KI-Wirtschaftsplan generiert");
    } catch (e: any) {
      toast.error("Fehler: " + (e.message || "Unbekannter Fehler"));
    } finally {
      setGenerating(false);
    }
  };

  const savePlan = useMutation({
    mutationFn: async () => {
      // Upsert plan
      const planData = {
        building_id: buildingId,
        fiscal_year: planYear,
        based_on_period_id: periodId,
        total_costs: totalPlanned,
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

      // Upsert items
      for (const acc of prevYearTotals) {
        const planned = getPlannedAmount(acc.id, acc.previousAmount);
        const existing = items.find((i: any) => i.account_id === acc.id);
        if (existing) {
          await supabase.from("economic_plan_items" as any).update({
            planned_amount: planned,
            previous_amount: acc.previousAmount,
          } as any).eq("id", existing.id);
        } else {
          await supabase.from("economic_plan_items" as any).insert({
            plan_id: planId,
            account_id: acc.id,
            previous_amount: acc.previousAmount,
            planned_amount: planned,
            distribution_key: acc.default_distribution_key || "mea",
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

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  // Calculate new monthly Hausgeld per owner
  const meaTotal = assignments.reduce((s, a: any) => {
    const mea = (a.contact_building_shares || []).find((sh: any) => sh.share_type === "mea");
    return s + (mea ? Number(mea.share_value) : 0);
  }, 0);

  const ownerHausgeld = assignments.map((a: any) => {
    const contact = a.contacts;
    const name = contact?.company_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "–";
    const mea = (a.contact_building_shares || []).find((sh: any) => sh.share_type === "mea");
    const meaValue = mea ? Number(mea.share_value) : 0;
    const proportion = meaTotal > 0 ? meaValue / meaTotal : 0;
    const annualShare = totalPlanned * proportion;
    const monthlyHausgeld = annualShare / 12;

    const currentCosts = (a.contact_building_costs || [])
      .filter((c: any) => c.cost_type === "hausgeld" || c.cost_type === "nebenkosten")
      .reduce((s: number, c: any) => s + Number(c.amount), 0);

    return { name, unitNumber: a.unit_number || "–", meaValue, monthlyHausgeld, currentHausgeld: currentCosts };
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
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Wirtschaftsplan {planYear}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Basierend auf der Abrechnung {fiscalYear}
              {existingPlan && (
                <Badge variant="outline" className="ml-2">
                  {existingPlan.status === "approved" ? "Genehmigt" : existingPlan.status === "active" ? "Aktiv" : "Entwurf"}
                </Badge>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={generateWithAI} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              KI-Vorschlag
            </Button>
            <Button size="sm" variant="outline" onClick={() => savePlan.mutate()} disabled={savePlan.isPending}>
              <Save className="h-4 w-4 mr-1" /> Speichern
            </Button>
            {existingPlan && existingPlan.status === "draft" && (
              <Button size="sm" onClick={() => approvePlan.mutate()} disabled={approvePlan.isPending}>
                <Check className="h-4 w-4 mr-1" /> Genehmigen
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
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
                {prevYearTotals.map((acc) => {
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
                          <span className={delta > 0 ? "text-red-600" : "text-green-600"}>
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
                <TableRow className="font-medium border-t-2">
                  <TableCell></TableCell>
                  <TableCell>Gesamt</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalPrevious)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(totalPlanned)}</TableCell>
                  <TableCell className="text-right text-xs">
                    {totalPrevious > 0 && (
                      <span className={totalPlanned > totalPrevious ? "text-red-600" : "text-green-600"}>
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
        </CardContent>
      </Card>

      {/* Hausgeld-Vergleich pro Eigentümer */}
      {ownerHausgeld.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hausgeld-Vergleich pro Eigentümer</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Einheit</TableHead>
                  <TableHead>Eigentümer</TableHead>
                  <TableHead className="text-right">MEA</TableHead>
                  <TableHead className="text-right">Aktuell / Monat</TableHead>
                  <TableHead className="text-right">Neu / Monat</TableHead>
                  <TableHead className="text-right">Differenz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownerHausgeld.map((o, i) => {
                  const diff = o.monthlyHausgeld - o.currentHausgeld;
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{o.unitNumber}</TableCell>
                      <TableCell className="text-sm">{o.name}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{o.meaValue.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatCurrency(o.currentHausgeld)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(o.monthlyHausgeld)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : ""}>
                          {diff > 0 ? "+" : ""}{formatCurrency(diff)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
