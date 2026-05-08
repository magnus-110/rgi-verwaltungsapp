import { useState, useMemo } from "react";
import { FuelInventorySection } from "./FuelInventorySection";
import { HeatingAccountsSection } from "./HeatingAccountsSection";
import { HeatingRebookingSection } from "./HeatingRebookingSection";
import { BillingSettlement } from "./BillingSettlement";
import { BookingReviewSection } from "./BookingReviewSection";
import { SettlementBasicsStep } from "./SettlementBasicsStep";
import { SettlementStatusBar, type SettlementStep } from "./SettlementStatusBar";
import { BrunataAllocationManager } from "./BrunataAllocationManager";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";

const STEPS = [
  { id: "basics", label: "Grundlagen", description: "Anfangsbestände, Hausgelder & IHR-Plan" },
  { id: "review", label: "Buchungen prüfen", description: "Vollständigkeit und Kategorisierung" },
  { id: "heating", label: "Heizkosten", description: "Brennstoff, Brunata-Werte, Umbuchung" },
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
        status = "todo";
        hint = s.description;
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
  }, [selectedBuildingId, selectedPeriodId, period]);

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
              <Card key={step.id} id={`billing-step-${step.id}`} className="overflow-hidden scroll-mt-24">
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
                          <HeatingRebookingSection buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                          <BrunataAllocationManager buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
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
