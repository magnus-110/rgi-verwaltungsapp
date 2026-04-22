import { useState } from "react";
import { EconomicPlanEditor } from "@/components/finance/EconomicPlanEditor";
import { ManualEconomicPlanEditor } from "@/components/finance/ManualEconomicPlanEditor";
import { BillingPeriodSelector } from "@/components/finance/BillingPeriodSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FilePlus2, FileStack } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Mode = "from-prev" | "manual";

export const EconomicPlan = () => {
  const navigate = useNavigate();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [manualYear, setManualYear] = useState<string>(String(new Date().getFullYear()));

  const { data: period } = useQuery({
    queryKey: ["billing-period-detail", selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return null;
      const { data, error } = await supabase
        .from("billing_periods").select("*").eq("id", selectedPeriodId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedPeriodId,
  });

  const { data: existingPlans = [] } = useQuery({
    queryKey: ["existing-plans", selectedBuildingId],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      const { data, error } = await supabase
        .from("economic_plans" as any)
        .select("id, fiscal_year, status, source")
        .eq("building_id", selectedBuildingId)
        .order("fiscal_year", { ascending: false });
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!selectedBuildingId,
  });

  const reset = () => { setMode(null); setSelectedPeriodId(null); };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/finanzen')} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Finanzen
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold">Wirtschaftsplan</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wirtschaftsplan aus Vorjahr generieren oder manuell anlegen
        </p>
      </div>

      <BillingPeriodSelector
        selectedBuildingId={selectedBuildingId}
        onBuildingChange={(id) => { setSelectedBuildingId(id); reset(); }}
        selectedPeriodId={selectedPeriodId}
        onPeriodChange={setSelectedPeriodId}
        showPeriod={mode === "from-prev"}
      />

      {!selectedBuildingId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Bitte wähle eine Liegenschaft.
          </CardContent>
        </Card>
      )}

      {/* Mode selection */}
      {selectedBuildingId && !mode && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setMode("from-prev")}
          >
            <CardContent className="py-8 text-center space-y-3">
              <FileStack className="h-10 w-10 mx-auto text-primary" />
              <h3 className="font-semibold">Aus Vorjahr generieren</h3>
              <p className="text-xs text-muted-foreground">
                Hochrechnung basierend auf einer bestehenden Abrechnungsperiode.
                Empfohlen, wenn ein Vorjahr im System ist.
              </p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setMode("manual")}
          >
            <CardContent className="py-8 text-center space-y-3">
              <FilePlus2 className="h-10 w-10 mx-auto text-primary" />
              <h3 className="font-semibold">Manuell anlegen</h3>
              <p className="text-xs text-muted-foreground">
                Leerer Plan zur direkten Eingabe. Empfohlen bei Neuübernahme einer
                Liegenschaft ohne Vorjahresdaten.
              </p>
            </CardContent>
          </Card>

          {existingPlans.length > 0 && (
            <Card className="md:col-span-2">
              <CardContent className="py-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Bestehende Pläne
                </p>
                <div className="flex flex-wrap gap-2">
                  {existingPlans.map((p: any) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      size="sm"
                      onClick={() => { setMode("manual"); setManualYear(String(p.fiscal_year)); }}
                    >
                      {p.fiscal_year}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.status === "active" ? "✓ aktiv" : p.status === "draft" ? "Entwurf" : "archiviert"}
                      </span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Manual mode: ask for year, then render editor */}
      {selectedBuildingId && mode === "manual" && (
        <>
          <Card>
            <CardContent className="py-4 flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Wirtschaftsjahr</Label>
                <Input
                  type="number"
                  value={manualYear}
                  onChange={(e) => setManualYear(e.target.value)}
                  className="w-32"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>Abbrechen</Button>
            </CardContent>
          </Card>
          {manualYear && /^\d{4}$/.test(manualYear) && (
            <ManualEconomicPlanEditor
              buildingId={selectedBuildingId}
              fiscalYear={parseInt(manualYear, 10)}
            />
          )}
        </>
      )}

      {/* From-previous mode: needs period */}
      {selectedBuildingId && mode === "from-prev" && !selectedPeriodId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <p>Bitte wähle das Abrechnungsjahr, auf dem der Wirtschaftsplan basieren soll.</p>
            <Button variant="ghost" size="sm" onClick={reset}>Abbrechen</Button>
          </CardContent>
        </Card>
      )}

      {selectedBuildingId && mode === "from-prev" && selectedPeriodId && period && (
        <EconomicPlanEditor
          buildingId={selectedBuildingId}
          periodId={selectedPeriodId}
          fiscalYear={period.fiscal_year}
        />
      )}
    </div>
  );
};
