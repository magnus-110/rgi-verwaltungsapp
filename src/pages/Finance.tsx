import { useState, useRef, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankStatementsTab } from "@/components/finance/BankStatementsTab";
import { BookingTemplatesTab } from "@/components/finance/BookingTemplatesTab";
import { BookingsTab } from "@/components/finance/BookingsTab";
import { BillingTab } from "@/components/finance/BillingTab";
import { BillingPeriodSelector } from "@/components/finance/BillingPeriodSelector";
import { CashAuditTab } from "@/components/finance/CashAuditTab";
import { BankReconciliationTab } from "@/components/finance/BankReconciliationTab";
import { ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const NEEDS_PERIOD_TABS = ["abrechnung"];
const NEEDS_PERIOD_SUB = ["bookings"]; // Sub-tabs under "buchen" that need a period

const SUB_TABS = [
  { value: "templates", label: "Vorlagen" },
  { value: "statements", label: "Kontoauszüge" },
  { value: "bookings", label: "Buchungen" },
  { value: "abgleich", label: "Kontenabgleich" },
] as const;

type SubTab = typeof SUB_TABS[number]["value"];

const STORAGE_KEY = "finance:tab-state:v1";

type PersistedState = {
  selectedBuildingId: string | null;
  selectedPeriodId: string | null;
  activeTab: string;
  activeSubTab: SubTab;
  expandedSections: string[];
};

const loadPersisted = (): Partial<PersistedState> => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const Finance = () => {
  const persisted = useRef(loadPersisted()).current;
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(persisted.selectedBuildingId ?? null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(persisted.selectedPeriodId ?? null);
  const [activeTab, setActiveTab] = useState(persisted.activeTab ?? "buchen");
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(persisted.activeSubTab ?? "statements");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(persisted.expandedSections ?? ["wirtschaftsplan"]));
  const [buchenHover, setBuchenHover] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedBuildingId,
        selectedPeriodId,
        activeTab,
        activeSubTab,
        expandedSections: Array.from(expandedSections),
      }));
    } catch {}
  }, [selectedBuildingId, selectedPeriodId, activeTab, activeSubTab, expandedSections]);

  const showPeriod =
    NEEDS_PERIOD_TABS.includes(activeTab) ||
    (activeTab === "buchen" && NEEDS_PERIOD_SUB.includes(activeSubTab));

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

  // Lade alle Perioden für Auto-Default
  const { data: allPeriods = [] } = useQuery({
    queryKey: ["billing-periods-default", selectedBuildingId],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      const { data, error } = await supabase
        .from("billing_periods")
        .select("id, fiscal_year")
        .eq("building_id", selectedBuildingId)
        .order("fiscal_year", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedBuildingId,
  });

  // Auto-Default Wirtschaftsjahr je nach Tab:
  // - Abrechnung, Planung & Berichte, Kassenprüfung → Vorjahr (currentYear - 1)
  // - Buchen → aktuelles Jahr
  useEffect(() => {
    if (!selectedBuildingId || !allPeriods.length) return;
    if (selectedPeriodId) return; // User-Auswahl respektieren

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const preferPrevious =
      activeTab === "abrechnung" ||
      activeTab === "planung" ||
      activeTab === "kassenpruefung";

    const targetYear = preferPrevious ? previousYear : currentYear;
    const match = allPeriods.find((p: any) => p.fiscal_year === targetYear)
      ?? (preferPrevious
        ? allPeriods.find((p: any) => p.fiscal_year < currentYear) ?? allPeriods[0]
        : allPeriods[0]);

    if (match) setSelectedPeriodId(match.id);
  }, [selectedBuildingId, allPeriods, activeTab, selectedPeriodId]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBuchenMouseEnter = () => {
    clearTimeout(hoverTimeout.current);
    setBuchenHover(true);
  };

  const handleBuchenMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => setBuchenHover(false), 150);
  };

  const handleSubTabClick = (sub: SubTab) => {
    setActiveSubTab(sub);
    setActiveTab("buchen");
    setBuchenHover(false);
  };

  const subLabel = SUB_TABS.find(s => s.value === activeSubTab)?.label ?? "";

  const SECTIONS = [
    { id: "wirtschaftsplan", label: "Wirtschaftsplan", description: "Gesamt- & Einzelwirtschaftsplan erstellen", icon: FileText },
    { id: "vermoegensbericht", label: "Vermögensbericht", description: "Vermögensübersicht der WEG", icon: Landmark },
    { id: "35a", label: "§35a Bescheinigung", description: "Haushaltsnahe Dienstleistungen für Eigentümer", icon: Receipt },
  ];

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Buchhaltung</h1>
        <p className="text-muted-foreground text-xs md:text-sm mt-1">
          Kontoauszüge, Buchungen, Abrechnungen und Wirtschaftspläne verwalten
        </p>
      </div>

      <BillingPeriodSelector
        selectedBuildingId={selectedBuildingId}
        onBuildingChange={(id) => { setSelectedBuildingId(id); setSelectedPeriodId(null); }}
        selectedPeriodId={selectedPeriodId}
        onPeriodChange={setSelectedPeriodId}
        showPeriod={showPeriod}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList variant="segment" className="grid w-full grid-cols-4 h-auto">
          {/* Custom Buchen trigger with hover dropdown */}
          <div
            className="relative"
            onMouseEnter={handleBuchenMouseEnter}
            onMouseLeave={handleBuchenMouseLeave}
          >
            <TabsTrigger
              variant="segment"
              value="buchen"
              className="w-full flex items-center justify-center gap-1 md:gap-1.5 min-h-[44px] text-xs md:text-sm px-1 md:px-3"
            >
              <span className="truncate">
                <span className="hidden sm:inline">Buchen · </span>
                <span className="sm:hidden">Buch.</span>
                <span className="hidden sm:inline">{subLabel}</span>
              </span>
              <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
            </TabsTrigger>

            {buchenHover && (
              <div className="absolute top-full left-0 z-50 mt-1 min-w-[160px] rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100">
                {SUB_TABS.map(sub => (
                  <button
                    key={sub.value}
                    onClick={() => handleSubTabClick(sub.value)}
                    className={`w-full text-left rounded-sm px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                      activeSubTab === sub.value && activeTab === "buchen"
                        ? "bg-accent/50 font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <TabsTrigger variant="segment" value="abrechnung" className="min-h-[44px] text-xs md:text-sm px-1 md:px-3">Abrechnung</TabsTrigger>
          <TabsTrigger variant="segment" value="planung" className="min-h-[44px] text-xs md:text-sm px-1 md:px-3"><span className="hidden sm:inline">Planung & Berichte</span><span className="sm:hidden">Plan.</span></TabsTrigger>
          <TabsTrigger variant="segment" value="kassenpruefung" className="min-h-[44px] text-xs md:text-sm px-1 md:px-3"><span className="hidden sm:inline">Kassenprüfung</span><span className="sm:hidden">Kasse</span></TabsTrigger>
        </TabsList>

        <TabsContent value="buchen">
          {activeSubTab === "templates" && (
            <BookingTemplatesTab
              sharedBuildingId={selectedBuildingId}
              onBuildingChange={setSelectedBuildingId}
            />
          )}
          {activeSubTab === "statements" && (
            <BankStatementsTab
              sharedBuildingId={selectedBuildingId}
              onBuildingChange={setSelectedBuildingId}
            />
          )}
          {activeSubTab === "bookings" && (
            <BookingsTab sharedBuildingId={selectedBuildingId} sharedPeriodId={selectedPeriodId} />
          )}
          {activeSubTab === "abgleich" && (
            <BankReconciliationTab
              sharedBuildingId={selectedBuildingId}
              onBuildingChange={setSelectedBuildingId}
            />
          )}
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
                            <EconomicPlanSection
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
        <TabsContent value="kassenpruefung">
          <CashAuditTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};