import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoicesTab } from "@/components/finance/InvoicesTab";
import { BankStatementsTab } from "@/components/finance/BankStatementsTab";
import { BookingTemplatesTab } from "@/components/finance/BookingTemplatesTab";
import { BookingsTab } from "@/components/finance/BookingsTab";
import { BillingTab } from "@/components/finance/BillingTab";
import { BillingPeriodSelector } from "@/components/finance/BillingPeriodSelector";
import { EconomicPlanEditor } from "@/components/finance/EconomicPlanEditor";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Finance = () => {
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
      <div>
        <h1 className="text-2xl font-bold">Finanzen</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Rechnungen, Abrechnungen und Wirtschaftspläne verwalten
        </p>
      </div>

      <Tabs defaultValue="buchen" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="buchen">Buchen</TabsTrigger>
          <TabsTrigger value="abrechnung">Abrechnung</TabsTrigger>
          <TabsTrigger value="wirtschaftsplan">Wirtschaftsplan</TabsTrigger>
        </TabsList>

        <TabsContent value="buchen">
          <Tabs defaultValue="invoices" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="invoices">Rechnungen</TabsTrigger>
              <TabsTrigger value="templates">Vorlagen</TabsTrigger>
              <TabsTrigger value="statements">Kontoauszüge</TabsTrigger>
              <TabsTrigger value="bookings">Buchungen</TabsTrigger>
            </TabsList>
            <TabsContent value="invoices"><InvoicesTab /></TabsContent>
            <TabsContent value="templates"><BookingTemplatesTab /></TabsContent>
            <TabsContent value="statements"><BankStatementsTab /></TabsContent>
            <TabsContent value="bookings"><BookingsTab /></TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="abrechnung">
          <BillingTab />
        </TabsContent>

        <TabsContent value="wirtschaftsplan" className="space-y-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
};
