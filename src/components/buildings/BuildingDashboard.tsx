import { useState } from "react";
import { Building2, MapPin, Edit, Trash2, Users, FileText, AlertCircle, Newspaper, Wrench, ChevronLeft, Landmark, Scale, Flame, Briefcase, Send } from "lucide-react";
import { BuildingCasesTab } from "./BuildingCasesTab";
import { BuildingCommunicationTab } from "./BuildingCommunicationTab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EditBuildingDialog } from "@/components/EditBuildingDialog";
import { DeleteBuildingDialog } from "@/components/DeleteBuildingDialog";
import { ManagerAssignmentDialog } from "@/components/ManagerAssignmentDialog";
import { BuildingContactsList } from "@/components/contacts/BuildingContactsList";
import { BuildingReportsTab } from "./BuildingReportsTab";
import { BuildingDocumentsTab } from "./BuildingDocumentsTab";
import { ExpiringDocumentsWidget } from "./ExpiringDocumentsWidget";
import { BuildingForumTab } from "./BuildingForumTab";
import { BuildingMaintenanceTab } from "./BuildingMaintenanceTab";
import { BuildingFinanceSummary } from "@/components/finance/BuildingFinanceSummary";
import { BuildingResolutionsTab } from "./BuildingResolutionsTab";
import { BuildingDistributionKeysTab } from "@/components/finance/BuildingDistributionKeysTab";
import { BuildingServiceProvidersTab } from "./BuildingServiceProvidersTab";
import { BuildingOverviewTab } from "./BuildingOverviewTab";
import { BuildingNotesTab } from "./BuildingNotesTab";
import { AnnualCycleBuildingTab } from "./AnnualCycleBuildingTab";
import { BuildingOnboardingTab } from "./BuildingOnboardingTab";
import { BuildingKeysTab } from "./keys/BuildingKeysTab";
import { BuildingDepositsTab } from "./BuildingDepositsTab";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

interface BuildingDashboardProps {
  buildingId: string;
  onBack?: () => void;
}

export const BuildingDashboard = ({ buildingId, onBack }: BuildingDashboardProps) => {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: building, isLoading } = useQuery({
    queryKey: ['building-detail', buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("*")
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Aggregierte Counts via RPC (1 Query statt 5)
  const { data: stats } = useQuery({
    queryKey: ['building-stats', buildingId, building?.management_mode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_building_dashboard_stats', { p_building_id: buildingId });
      if (error) {
        console.warn('Dashboard stats RPC failed', error);
        return null;
      }
      return data as Record<string, number> | null;
    },
    enabled: !!building,
    staleTime: 60_000,
  });

  const contactCount = stats?.contact_count ?? 0;
  const fileCount = stats?.file_count ?? 0;
  const forumCount = stats?.forum_count ?? 0;

  // Reports (modus-abhängig, separat)
  const { data: reportCount = 0 } = useQuery({
    queryKey: ['building-report-count', buildingId, building?.management_mode],
    queryFn: async () => {
      if (!building) return 0;
      const table = building.management_mode === 'weg' ? 'weg_reports' : 'miete_reports';
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
        .eq('building_id', buildingId).eq('status', 'open');
      return count || 0;
    },
    enabled: !!building,
  });

  const { data: managerNames = [] } = useQuery({
    queryKey: ['building-managers-names', buildingId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_building_manager_names', { building_id_param: buildingId });
      if (error) return [];
      return data || [];
    },
  });


  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['building-detail', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-stats', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-report-count', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-managers-names', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['buildings-list'] });
  };

  if (isLoading || !building) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {isLoading ? "Laden..." : "Gebäude nicht gefunden"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 md:p-6 border-b border-border bg-card sticky top-0 z-10">
        <div className="flex items-start justify-between gap-2 md:gap-4">
          <div className="flex items-start gap-2 md:gap-3 min-w-0 flex-1">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden h-10 w-10 -ml-2 flex-shrink-0">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="p-2 md:p-2.5 bg-primary/10 rounded-xl flex-shrink-0">
              <Building2 className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base md:text-2xl font-bold truncate leading-tight">{building.name}</h1>
              <div className="flex items-center gap-1.5 mt-1 md:mt-1.5 flex-wrap">
                <Badge variant="secondary" className="text-[10px] md:text-xs px-1.5 py-0">
                  {building.management_mode === 'weg' ? 'WEG' : 'Miete'}
                </Badge>
                <Badge variant="secondary" className="text-[10px] md:text-xs px-1.5 py-0">
                  {building.unit_count} EH
                </Badge>
                {Array.isArray(managerNames) && managerNames.length > 0 && (
                  <Badge variant="outline" className="text-[10px] md:text-xs px-1.5 py-0 hidden sm:inline-flex">
                    <Users className="h-3 w-3 mr-1" />
                    {managerNames.join(', ')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setIsManagerOpen(true)} title="Verwalter zuweisen" className="h-10 w-10">
              <Users className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsEditOpen(true)} title="Bearbeiten" className="h-10 w-10">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsDeleteOpen(true)} title="Löschen"
              className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="px-2 md:px-6 bg-card border-b border-border overflow-x-auto scrollbar-hide sticky top-[72px] md:top-auto z-[9]">
          <TabsList variant="underline" className="h-auto">
            {[
              { value: "overview", label: "Übersicht" },
              // Jahreszyklus ist als Timeline in der Übersicht eingebunden – kein eigener Tab mehr.
              { value: "people", label: "Personen" },
              { value: "cases", label: "Vorgänge" },
              { value: "documents", label: "Dokumente" },
              { value: "notes", label: "Notizen" },
              { value: "forum", label: "Schwarzes Brett" },
              { value: "providers", label: "Dienstleister" },
              { value: "communication", label: "Kommunikation" },
              { value: "distribution", label: "Kontenrahmen" },
              ...(building.management_mode === 'weg' ? [{ value: "resolutions", label: "Beschlüsse" }] : []),
              ...(building.management_mode === 'rent' ? [{ value: "deposits", label: "Kaution" }] : []),
              { value: "maintenance", label: "Wartung" },
              { value: "keys", label: "Schlüssel" },
              { value: "onboarding", label: "Onboarding" },
            ].map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} variant="underline"
                className="px-3 md:px-4 py-3 text-xs md:text-sm whitespace-nowrap min-h-[44px]">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          {/* Overview Tab */}
          <TabsContent value="overview" className="p-3 md:p-6 mt-0">
            <BuildingOverviewTab
              buildingId={buildingId}
              buildingName={building.name}
              managementMode={building.management_mode as "weg" | "rent"}
              onJumpTab={setActiveTab}
            />
          </TabsContent>

          {/* Jahreszyklus jetzt als Timeline in BuildingOverviewTab eingebettet */}


          {/* People Tab */}
          <TabsContent value="people" className="p-3 md:p-6 mt-0 space-y-6">
            <BuildingContactsList buildingId={buildingId} managementMode={building?.management_mode || 'weg'} />
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="p-3 md:p-6 mt-0">
            <BuildingReportsTab buildingId={buildingId} managementMode={building.management_mode} />
          </TabsContent>

          {/* Cases Tab */}
          <TabsContent value="cases" className="p-3 md:p-6 mt-0">
            <BuildingCasesTab buildingId={buildingId} managementMode={building.management_mode as any} />
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="p-3 md:p-6 mt-0">
            <BuildingDocumentsTab buildingId={buildingId} managementMode={building.management_mode} />
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="p-3 md:p-6 mt-0">
            <BuildingNotesTab buildingId={buildingId} />
          </TabsContent>

          {/* Forum Tab */}
          <TabsContent value="forum" className="p-3 md:p-6 mt-0">
            <BuildingForumTab buildingId={buildingId} managementMode={building.management_mode} />
          </TabsContent>

          {/* Maintenance Tab */}
          <TabsContent value="maintenance" className="p-3 md:p-6 mt-0">
            <BuildingMaintenanceTab buildingId={buildingId} />
          </TabsContent>

          {/* Distribution Keys Tab */}
          <TabsContent value="distribution" className="p-3 md:p-6 mt-0">
            <BuildingDistributionKeysTab buildingId={buildingId} />
          </TabsContent>

          {/* Service Providers Tab */}
          <TabsContent value="providers" className="p-3 md:p-6 mt-0">
            <BuildingServiceProvidersTab buildingId={buildingId} />
          </TabsContent>

          {/* Communication Tab */}
          <TabsContent value="communication" className="p-3 md:p-6 mt-0">
            <BuildingCommunicationTab buildingId={buildingId} />
          </TabsContent>

          {/* Resolutions Tab (WEG only) */}
          {building.management_mode === 'weg' && (
            <TabsContent value="resolutions" className="p-3 md:p-6 mt-0">
              <BuildingResolutionsTab buildingId={buildingId} />
            </TabsContent>
          )}

          {/* Keys Tab */}
          <TabsContent value="keys" className="p-3 md:p-6 mt-0">
            <BuildingKeysTab buildingId={buildingId} />
          </TabsContent>

          {/* Onboarding Tab */}
          <TabsContent value="onboarding" className="p-3 md:p-6 mt-0">
            <BuildingOnboardingTab buildingId={buildingId} />
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* Dialogs */}
      <EditBuildingDialog building={building} isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} onUpdate={handleRefresh} />
      <DeleteBuildingDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} buildingId={buildingId}
        buildingName={building.name} buildingCode={building.building_code} onDelete={() => { handleRefresh(); navigate('/buildings'); }} />
      <ManagerAssignmentDialog isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)} buildingId={buildingId} buildingName={building.name} />
    </div>
  );
};

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3 md:p-4 flex items-center gap-2 md:gap-3">
        <div className="p-1.5 md:p-2 rounded-lg bg-primary/10 text-primary flex-shrink-0">
          <Icon className="h-4 w-4 md:h-5 md:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-lg md:text-2xl font-bold leading-tight">{value}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
