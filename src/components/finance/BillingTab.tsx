import { useState } from "react";
import { BillingPeriodSelector } from "./BillingPeriodSelector";
import { BalanceCarryForward } from "./BalanceCarryForward";
import { FuelInventorySection } from "./FuelInventorySection";
import { HeatingAccountsSection } from "./HeatingAccountsSection";
import { HeatingExportSection } from "./HeatingExportSection";
import { HeatingRebookingSection } from "./HeatingRebookingSection";
import { AccrualSection } from "./AccrualSection";
import { BillingSettlement } from "./BillingSettlement";
import { BillingValidationPanel } from "./BillingValidationPanel";
import { BillingAiAnalysis } from "./BillingAiAnalysis";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";

const STEPS = [
  { id: "balances", label: "Salden vom Vorjahr übernehmen", icon: "💰" },
  { id: "heating", label: "Heizkosten-Konten & Brennstoff", icon: "🔥" },
  { id: "export", label: "Daten an Ablesefirma exportieren", icon: "📤" },
  { id: "rebooking", label: "Heizkosten-Umbuchungen", icon: "🔄" },
  { id: "accruals", label: "Abgrenzungsbuchungen prüfen", icon: "📋" },
  { id: "settlement", label: "Gesamtabrechnung", icon: "📊" },
];

export function BillingTab() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(["balances"]));

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

  return (
    <div className="space-y-4">
      <BillingPeriodSelector
        selectedBuildingId={selectedBuildingId}
        onBuildingChange={setSelectedBuildingId}
        selectedPeriodId={selectedPeriodId}
        onPeriodChange={setSelectedPeriodId}
      />

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
        <div className="space-y-3">
          {STEPS.map((step) => {
            const isExpanded = expandedSteps.has(step.id);
            return (
              <div key={step.id} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleStep(step.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 text-left"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="text-lg">{step.icon}</span>
                  <span className="font-medium text-sm">{step.label}</span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4">
                    {step.id === "balances" && (
                      <BalanceCarryForward
                        buildingId={selectedBuildingId}
                        fiscalYear={period.fiscal_year}
                        periodId={selectedPeriodId}
                      />
                    )}
                    {step.id === "heating" && (
                      <div className="space-y-4">
                        <HeatingAccountsSection buildingId={selectedBuildingId} fiscalYear={period.fiscal_year} />
                        <FuelInventorySection buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                      </div>
                    )}
                    {step.id === "export" && (
                      <HeatingExportSection buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                    )}
                    {step.id === "rebooking" && (
                      <HeatingRebookingSection buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                    )}
                    {step.id === "accruals" && (
                      <AccrualSection buildingId={selectedBuildingId} fiscalYear={period.fiscal_year} />
                    )}
                    {step.id === "settlement" && (
                      <BillingSettlement buildingId={selectedBuildingId} periodId={selectedPeriodId} fiscalYear={period.fiscal_year} />
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Kontrollcenter + KI-Analyse */}
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
