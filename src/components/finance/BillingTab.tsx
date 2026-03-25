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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Info, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { id: "balances", label: "Saldenübernahme", description: "Schlusssalden des Vorjahres als Eröffnungssalden übernehmen" },
  { id: "heating", label: "Heizkosten & Brennstoff", description: "Heizkonten prüfen und Brennstoffdaten erfassen" },
  { id: "export", label: "Export Ablesefirma", description: "Daten für die Ablesefirma als CSV exportieren" },
  { id: "rebooking", label: "Heizkosten-Umbuchungen", description: "Einzelkonten auf das zentrale Heizkonto umbuchen" },
  { id: "accruals", label: "Abgrenzungsbuchungen", description: "Jahresübergreifende Leistungszeiträume prüfen" },
  { id: "settlement", label: "Gesamtabrechnung", description: "Kosten verteilen und Einzelabrechnungen erstellen" },
];

export function BillingTab() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(["balances"]));
  const [showGuide, setShowGuide] = useState(false);

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

      {/* Info-Bereich */}
      <Collapsible open={showGuide} onOpenChange={setShowGuide}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
          <Info className="h-4 w-4" />
          <span>Anleitung: Abrechnung Schritt für Schritt</span>
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
                Arbeiten Sie die Schritte der Reihe nach ab. Die Validierungsprüfungen und die KI-Analyse am Ende helfen bei der Qualitätskontrolle.
              </p>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

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
