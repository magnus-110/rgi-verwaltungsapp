import { useState } from "react";
import { EconomicPlanEditor } from "@/components/finance/EconomicPlanEditor";
import { BillingPeriodSelector } from "@/components/finance/BillingPeriodSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const EconomicPlan = () => {
  const navigate = useNavigate();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

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
          Wirtschaftsplan basierend auf der Vorjahresabrechnung erstellen
        </p>
      </div>

      <BillingPeriodSelector
        selectedBuildingId={selectedBuildingId}
        onBuildingChange={setSelectedBuildingId}
        selectedPeriodId={selectedPeriodId}
        onPeriodChange={setSelectedPeriodId}
      />

      {!selectedBuildingId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Bitte wähle eine Liegenschaft als Basis für den Wirtschaftsplan.
          </CardContent>
        </Card>
      )}

      {selectedBuildingId && !selectedPeriodId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Bitte wähle das Abrechnungsjahr, auf dem der Wirtschaftsplan basieren soll.
          </CardContent>
        </Card>
      )}

      {selectedBuildingId && selectedPeriodId && period && (
        <EconomicPlanEditor
          buildingId={selectedBuildingId}
          periodId={selectedPeriodId}
          fiscalYear={period.fiscal_year}
        />
      )}
    </div>
  );
};
