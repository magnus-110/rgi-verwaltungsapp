import { useState, useEffect, useMemo } from "react";
import { FuelInventorySection } from "./FuelInventorySection";
import { HeatingAccountsSection } from "./HeatingAccountsSection";
import { HeatingRebookingSection } from "./HeatingRebookingSection";
import { AccrualSection } from "./AccrualSection";
import { BillingSettlement } from "./BillingSettlement";
import { BillingAiAnalysis } from "./BillingAiAnalysis";
import { BookingReviewSection } from "./BookingReviewSection";
import { BalanceCarryForward } from "./BalanceCarryForward";
import { SettlementBasicsStep } from "./SettlementBasicsStep";
import { SettlementStatusBar, type SettlementStep } from "./SettlementStatusBar";
import { BrunataAllocationManager } from "./BrunataAllocationManager";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Check, AlertTriangle } from "lucide-react";

const STEPS = [
  { id: "basics", label: "Grundlagen", description: "Anfangsbestände, Hausgelder & IHR-Plan" },
  { id: "review", label: "Buchungen prüfen", description: "Vollständigkeit und Kategorisierung" },
  { id: "heating", label: "Heizkosten", description: "Brennstoff, Brunata-Werte, Umbuchung" },
  { id: "accruals", label: "Abgrenzungen", description: "Jahresübergreifende Leistungszeiträume" },
  { id: "settlement", label: "Abrechnung erzeugen", description: "Gesamt & Einzel + PDF" },
];

interface BillingTabProps {
  sharedBuildingId?: string | null;
  onBuildingChange?: (id: string | null) => void;
  sharedPeriodId?: string | null;
  onPeriodChange?: (id: string | null) => void;
}

export function BillingTab({ sharedBuildingId, onBuildingChange, sharedPeriodId, onPeriodChange }: BillingTabProps) {
  const [internalBuildingId, setInternalBuildingId] = useState<string | null>(null);
  const [internalPeriodId, setInternalPeriodId] = useState<string | null>(null);
  const selectedBuildingId = sharedBuildingId ?? internalBuildingId;
  const selectedPeriodId = sharedPeriodId ?? internalPeriodId;
  const setSelectedBuildingId = (id: string | null) => {
    setInternalBuildingId(id);
    onBuildingChange?.(id);
  };
  const setSelectedPeriodId = (id: string | null) => {
    setInternalPeriodId(id);
    onPeriodChange?.(id);
  };
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

  // Live-Status pro Schritt (für Sticky-StatusBar)
  const stepStatuses = useMemo<SettlementStep[]>(() => {
    return STEPS.map((s) => {
      let status: "ok" | "warning" | "todo" = "todo";
      let hint: string | undefined;
      if (!selectedBuildingId || !selectedPeriodId || !period) {
        return { id: s.id, label: s.label, status: "todo", hint: s.description };
      }
      if (s.id === "basics") {
        status = balanceStatus === "done" ? "ok" : balanceStatus === "no_data" ? "warning" : "todo";
        hint = balanceStatus === "done" ? "Salden übernommen" : "Vorjahresdaten prüfen";
      } else if (s.id === "review") {
        status = "todo";
        hint = "Buchungen prüfen";
      } else if (s.id === "heating") {
        status = "todo";
        hint = "Brunata-Werte eintragen";
      } else if (s.id === "accruals") {
        status = "todo";
        hint = "Abgrenzungen bestätigen";
      } else if (s.id === "settlement") {
        status = "todo";
        hint = "PDF erzeugen";
      }
      return { id: s.id, label: s.label, status, hint };
    });
  }, [selectedBuildingId, selectedPeriodId, period, balanceStatus]);

  const handleStepJump = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
    // Smooth-scroll to anchor
    requestAnimationFrame(() => {
      const el = document.getElementById(`billing-step-${stepId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="space-y-4">
      {/* BillingPeriodSelector is now rendered globally in Finance.tsx */}

      {/* Sticky Status-Ampel über alle 5 Schritte */}
      {selectedBuildingId && selectedPeriodId && period && (
        <SettlementStatusBar steps={stepStatuses} onStepClick={handleStepJump} />
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
                      {step.id === "basics" && (
                        <SettlementBasicsStep
                          buildingId={selectedBuildingId}
                          periodId={selectedPeriodId}
                          fiscalYear={period.fiscal_year}
                        />
                      )}
                      {step.id === "review" && (
                        <div className="space-y-4">
                          <BalanceCarryForward
                            buildingId={selectedBuildingId}
                            fiscalYear={period.fiscal_year}
                            periodId={selectedPeriodId}
                          />
                          <BookingReviewSection
                            buildingId={selectedBuildingId}
                            fiscalYear={period.fiscal_year}
                            periodFrom={period.period_from}
                            periodTo={period.period_to}
                          />
                        </div>
                      )}
                      {step.id === "heating" && (
                        <div className="space-y-4">
                          <HeatingAccountsSection buildingId={selectedBuildingId} fiscalYear={period.fiscal_year} />
                          <FuelInventorySection buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                          <BrunataAllocationManager buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
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
