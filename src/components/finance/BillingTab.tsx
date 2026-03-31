import { useState, useEffect } from "react";
import { BillingPeriodSelector } from "./BillingPeriodSelector";
import { FuelInventorySection } from "./FuelInventorySection";
import { HeatingAccountsSection } from "./HeatingAccountsSection";
import { HeatingExportSection } from "./HeatingExportSection";
import { HeatingRebookingSection } from "./HeatingRebookingSection";
import { AccrualSection } from "./AccrualSection";
import { BillingSettlement } from "./BillingSettlement";
import { BillingValidationPanel } from "./BillingValidationPanel";
import { BillingAiAnalysis } from "./BillingAiAnalysis";
import { BookingReviewSection } from "./BookingReviewSection";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Check, AlertTriangle } from "lucide-react";

const STEPS = [
  { id: "review", label: "Buchungsprüfung", description: "Buchungen je Konto prüfen und Vollständigkeit kontrollieren" },
  { id: "heating", label: "Heizkosten", description: "Heizkonten, Brennstoff und Umbuchung auf Heizkostenkonto" },
  { id: "accruals", label: "Abgrenzungen", description: "Jahresübergreifende Leistungszeiträume prüfen" },
  { id: "settlement", label: "Gesamtabrechnung", description: "Kosten verteilen und Einzelabrechnungen erstellen" },
];

export function BillingTab() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(["review"]));
  const [balanceStatus, setBalanceStatus] = useState<"idle" | "done" | "no_data">("idle");

  const { data: period } = useQuery({
    queryKey: ["billing-period-detail", selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return null;
      const { data, error } = await supabase
        .from("billing_periods")
        .select("*")
        .eq("id", selectedPeriodId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPeriodId,
  });

  // Auto balance carry-forward when period is selected
  useEffect(() => {
    if (!selectedBuildingId || !period) {
      setBalanceStatus("idle");
      return;
    }

    const autoCarryForward = async () => {
      const fiscalYear = period.fiscal_year;
      const prevYear = fiscalYear - 1;

      // Get carry-forward accounts
      const { data: carryAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("carry_forward_balance", true)
        .or(`building_id.is.null,building_id.eq.${selectedBuildingId}`);

      if (!carryAccounts?.length) {
        setBalanceStatus("no_data");
        return;
      }

      // Check if already carried forward
      const { data: existing } = await supabase
        .from("account_balances")
        .select("id")
        .eq("building_id", selectedBuildingId)
        .eq("fiscal_year", fiscalYear)
        .eq("is_carried_forward", true)
        .limit(1);

      if (existing?.length) {
        setBalanceStatus("done");
        return;
      }

      // Get previous year balances
      const { data: prevBalances } = await supabase
        .from("account_balances")
        .select("*")
        .eq("building_id", selectedBuildingId)
        .eq("fiscal_year", prevYear);

      if (!prevBalances?.length) {
        setBalanceStatus("no_data");
        return;
      }

      // Upsert balances
      const upserts = carryAccounts.map(acc => {
        const prev = prevBalances.find(b => b.account_id === acc.id);
        return {
          building_id: selectedBuildingId,
          account_id: acc.id,
          fiscal_year: fiscalYear,
          opening_balance: prev?.closing_balance ?? 0,
          closing_balance: prev?.closing_balance ?? 0,
          is_carried_forward: true,
        };
      });

      await supabase.from("account_balances").upsert(upserts, {
        onConflict: "building_id,account_id,fiscal_year",
      });

      setBalanceStatus("done");
    };

    autoCarryForward();
  }, [selectedBuildingId, period]);

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.has(stepId) ? next.delete(stepId) : next.add(stepId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <BillingPeriodSelector
        selectedBuildingId={selectedBuildingId}
        onBuildingChange={setSelectedBuildingId}
        selectedPeriodId={selectedPeriodId}
        onPeriodChange={setSelectedPeriodId}
      />

      {/* Balance carry-forward status */}
      {selectedBuildingId && selectedPeriodId && balanceStatus !== "idle" && (
        <div className="flex items-center gap-2">
          {balanceStatus === "done" && (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
              <Check className="h-3 w-3 mr-1" /> Salden übernommen
            </Badge>
          )}
          {balanceStatus === "no_data" && (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
              <AlertTriangle className="h-3 w-3 mr-1" /> Keine Vorjahresdaten
            </Badge>
          )}
        </div>
      )}

      {!selectedBuildingId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Bitte wähle eine Liegenschaft, um die Abrechnung zu starten.
          </CardContent>
        </Card>
      )}

      {selectedBuildingId && !selectedPeriodId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Bitte wähle ein Abrechnungsjahr oder erstelle einen neuen Zeitraum.
          </CardContent>
        </Card>
      )}

      {selectedBuildingId && selectedPeriodId && period && (
        <div className="space-y-2">
          {STEPS.map((step, index) => {
            const isExpanded = expandedSteps.has(step.id);
            return (
              <Card key={step.id} className="overflow-hidden">
                <button
                  onClick={() => toggleStep(step.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 text-left transition-colors"
                >
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
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
                      {step.id === "review" && (
                        <BookingReviewSection
                          buildingId={selectedBuildingId}
                          fiscalYear={period.fiscal_year}
                          periodFrom={period.period_from}
                          periodTo={period.period_to}
                        />
                      )}
                      {step.id === "heating" && (
                        <div className="space-y-4">
                          <HeatingAccountsSection buildingId={selectedBuildingId} fiscalYear={period.fiscal_year} />
                          <FuelInventorySection buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                          <HeatingExportSection buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                          <HeatingRebookingSection buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                        </div>
                      )}
                      {step.id === "accruals" && (
                        <AccrualSection buildingId={selectedBuildingId} fiscalYear={period.fiscal_year} periodFrom={period.period_from} periodTo={period.period_to} />
                      )}
                      {step.id === "settlement" && (
                        <BillingSettlement buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}

          <BillingValidationPanel
            periodId={selectedPeriodId}
            buildingId={selectedBuildingId}
            fiscalYear={period.fiscal_year}
          />
          <BillingAiAnalysis
            buildingId={selectedBuildingId}
            periodId={selectedPeriodId}
            fiscalYear={period.fiscal_year}
          />
        </div>
      )}
    </div>
  );
}
