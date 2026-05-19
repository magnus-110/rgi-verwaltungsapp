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
import { FinanceDocumentsMenu } from "@/components/finance/FinanceDocumentsMenu";

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
  const [buchenHover, setBuchenHover] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedBuildingId,
        selectedPeriodId,
        activeTab,
        activeSubTab,
      }));
    } catch {}
  }, [selectedBuildingId, selectedPeriodId, activeTab, activeSubTab]);


  const showPeriod =
    NEEDS_PERIOD_TABS.includes(activeTab) ||
    (activeTab === "buchen" && NEEDS_PERIOD_SUB.includes(activeSubTab));


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
  // - Abrechnung, Kassenprüfung → Vorjahr (currentYear - 1)
  // - Buchen → aktuelles Jahr
  useEffect(() => {
    if (!selectedBuildingId || !allPeriods.length) return;
    if (selectedPeriodId) return; // User-Auswahl respektieren

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const preferPrevious =
      activeTab === "abrechnung" ||
      activeTab === "kassenpruefung";

    const targetYear = preferPrevious ? previousYear : currentYear;
    const match = allPeriods.find((p: any) => p.fiscal_year === targetYear)
      ?? (preferPrevious
        ? allPeriods.find((p: any) => p.fiscal_year < currentYear) ?? allPeriods[0]
        : allPeriods[0]);

    if (match) setSelectedPeriodId(match.id);
  }, [selectedBuildingId, allPeriods, activeTab, selectedPeriodId]);

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
        <TabsList variant="segment" className="grid w-full grid-cols-3 h-auto">
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

        <TabsContent value="kassenpruefung">
          <CashAuditTab />
        </TabsContent>

      </Tabs>
    </div>
  );
};