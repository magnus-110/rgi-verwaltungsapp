import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankStatementsTab } from "@/components/finance/BankStatementsTab";
import { BankStatementsTab } from "@/components/finance/BankStatementsTab";
import { BookingTemplatesTab } from "@/components/finance/BookingTemplatesTab";
import { BookingsTab } from "@/components/finance/BookingsTab";
import { BillingTab } from "@/components/finance/BillingTab";
import { BillingPeriodSelector } from "@/components/finance/BillingPeriodSelector";
import { EconomicPlanEditor } from "@/components/finance/EconomicPlanEditor";
import { AssetReportSection } from "@/components/finance/AssetReportSection";
import { Paragraph35aSection } from "@/components/finance/Paragraph35aSection";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, FileText, Landmark, Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const NEEDS_PERIOD = ["abrechnung", "planung"];

export const Finance = () => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("buchen");
  const [activeSubTab, setActiveSubTab] = useState("invoices");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["wirtschaftsplan"]));

  const showPeriod = NEEDS_PERIOD.includes(activeTab);

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

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const SECTIONS = [
    { id: "wirtschaftsplan", label: "Wirtschaftsplan", description: "Gesamt- & Einzelwirtschaftsplan erstellen", icon: FileText },
    { id: "vermoegensbericht", label: "Vermögensbericht", description: "Vermögensübersicht der WEG", icon: Landmark },
    { id: "35a", label: "§35a Bescheinigung", description: "Haushaltsnahe Dienstleistungen für Eigentümer", icon: Receipt },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Buchhaltung</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Kontoauszüge, Buchungen, Abrechnungen und Wirtschaftspläne verwalten
        </p>
      </div>

      {/* Global building (+ optional period) selector */}
      <BillingPeriodSelector
        selectedBuildingId={selectedBuildingId}
        onBuildingChange={(id) => { setSelectedBuildingId(id); setSelectedPeriodId(null); }}
        selectedPeriodId={selectedPeriodId}
        onPeriodChange={setSelectedPeriodId}
        showPeriod={showPeriod}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList variant="segment" className="grid w-full grid-cols-3">
          <TabsTrigger variant="segment" value="buchen">Buchen</TabsTrigger>
          <TabsTrigger variant="segment" value="abrechnung">Abrechnung</TabsTrigger>
          <TabsTrigger variant="segment" value="planung">Planung & Berichte</TabsTrigger>
        </TabsList>

        <TabsContent value="buchen">
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
            <TabsList variant="pill" className="grid w-full grid-cols-3">
              <TabsTrigger variant="pill" value="templates">Vorlagen</TabsTrigger>
              <TabsTrigger variant="pill" value="statements">Kontoauszüge</TabsTrigger>
              <TabsTrigger variant="pill" value="bookings">Buchungen</TabsTrigger>
            </TabsList>
            <TabsContent value="templates">
              <BookingTemplatesTab
                sharedBuildingId={selectedBuildingId}
                onBuildingChange={setSelectedBuildingId}
              />
            </TabsContent>
            <TabsContent value="statements">
              <BankStatementsTab
                sharedBuildingId={selectedBuildingId}
                onBuildingChange={setSelectedBuildingId}
              />
            </TabsContent>
            <TabsContent value="bookings"><BookingsTab /></TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="abrechnung">
          <BillingTab
            sharedBuildingId={selectedBuildingId}
            onBuildingChange={setSelectedBuildingId}
            sharedPeriodId={selectedPeriodId}
            onPeriodChange={setSelectedPeriodId}
          />
        </TabsContent>

        <TabsContent value="planung" className="space-y-4">
          {!selectedBuildingId && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Bitte wähle eine Liegenschaft als Basis.
              </CardContent>
            </Card>
          )}

          {selectedBuildingId && !selectedPeriodId && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Bitte wähle das Abrechnungsjahr.
              </CardContent>
            </Card>
          )}

          {selectedBuildingId && selectedPeriodId && period && (
            <div className="space-y-2">
              {SECTIONS.map(section => {
                const isExpanded = expandedSections.has(section.id);
                const Icon = section.icon;
                return (
                  <Card key={section.id} className="overflow-hidden">
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 text-left transition-colors"
                    >
                      <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{section.label}</span>
                        {!isExpanded && (
                          <span className="text-xs text-muted-foreground ml-2 hidden md:inline">{section.description}</span>
                        )}
                      </div>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t">
                        <div className="pt-4">
                          {section.id === "wirtschaftsplan" && (
                            <EconomicPlanEditor
                              buildingId={selectedBuildingId}
                              periodId={selectedPeriodId}
                              fiscalYear={period.fiscal_year}
                            />
                          )}
                          {section.id === "vermoegensbericht" && (
                            <AssetReportSection
                              buildingId={selectedBuildingId}
                              periodId={selectedPeriodId}
                              fiscalYear={period.fiscal_year}
                            />
                          )}
                          {section.id === "35a" && (
                            <Paragraph35aSection
                              buildingId={selectedBuildingId}
                              periodId={selectedPeriodId}
                              fiscalYear={period.fiscal_year}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
