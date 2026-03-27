import { useState } from "react";
import { Building2, MapPin, Edit, Trash2, Users, FileText, AlertCircle, Newspaper, Wrench, ChevronLeft, Landmark, Scale, Flame } from "lucide-react";
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
import { BuildingFilesTab } from "./BuildingFilesTab";
import { BuildingForumTab } from "./BuildingForumTab";
import { BuildingMaintenanceTab } from "./BuildingMaintenanceTab";
import { BuildingFinanceSummary } from "@/components/finance/BuildingFinanceSummary";
import { BuildingResolutionsTab } from "./BuildingResolutionsTab";
import { BuildingDistributionKeysTab } from "@/components/finance/BuildingDistributionKeysTab";
import { UtilityContractsTab } from "@/components/finance/UtilityContractsTab";
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

  const { data: contactCount = 0 } = useQuery({
    queryKey: ['building-contact-count', buildingId],
    queryFn: async () => {
      const { count } = await supabase.from('contact_building_assignments').select('*', { count: 'exact', head: true })
        .eq('building_id', buildingId).eq('is_active', true);
      return count || 0;
    },
  });

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

  const { data: fileCount = 0 } = useQuery({
    queryKey: ['building-file-count', buildingId],
    queryFn: async () => {
      const { count } = await supabase.from('building_files').select('*', { count: 'exact', head: true }).eq('building_id', buildingId);
      return count || 0;
    },
  });

  const { data: forumCount = 0 } = useQuery({
    queryKey: ['building-forum-count', buildingId],
    queryFn: async () => {
      const { count } = await supabase.from('forum_posts').select('*', { count: 'exact', head: true }).eq('building_id', buildingId);
      return count || 0;
    },
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
    queryClient.invalidateQueries({ queryKey: ['building-contact-count', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-report-count', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-file-count', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-forum-count', buildingId] });
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
      <div className="p-4 md:p-6 border-b border-border bg-card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden -ml-2 mt-0.5">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="p-2.5 bg-primary/10 rounded-xl flex-shrink-0">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold truncate">{building.name}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {building.management_mode === 'weg' ? 'WEG' : 'Miete'}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {building.unit_count} Einheiten
                </Badge>
                {Array.isArray(managerNames) && managerNames.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {managerNames.join(', ')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setIsManagerOpen(true)} title="Verwalter zuweisen">
              <Users className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsEditOpen(true)} title="Bearbeiten">
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsDeleteOpen(true)} title="Löschen"
              className="text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 md:px-6 bg-card overflow-x-auto">
          <TabsList variant="underline">
            {[
              { value: "overview", label: "Übersicht" },
              { value: "people", label: "Personen" },
              { value: "reports", label: "Meldungen" },
              { value: "documents", label: "Dokumente" },
              { value: "forum", label: "Schwarzes Brett" },
              { value: "maintenance", label: "Wartung" },
              { value: "distribution", label: "Kontenrahmen" },
              { value: "utility", label: "Versorgung" },
              { value: "finance", label: "Finanzen" },
              ...(building.management_mode === 'weg' ? [{ value: "resolutions", label: "Beschlüsse" }] : []),
            ].map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} variant="underline"
                className="px-4 py-3 whitespace-nowrap">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          {/* Overview Tab */}
          <TabsContent value="overview" className="p-4 md:p-6 mt-0 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Kontakte" value={contactCount} />
              <StatCard icon={AlertCircle} label="Offene Meldungen" value={reportCount} />
              <StatCard icon={FileText} label="Dokumente" value={fileCount} />
              <StatCard icon={Newspaper} label="Beiträge" value={forumCount} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Personen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kontakte</span>
                    <span className="font-medium">{contactCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Verwalter</span>
                    <span className="font-medium">{managerNames.length}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Gebäudedetails</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Adresse</span>
                    <span className="font-medium text-right">{building.address}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Verwaltungsart</span>
                    <span className="font-medium">{building.management_mode === 'weg' ? 'WEG' : 'Miete'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Einheiten</span>
                    <span className="font-medium">{building.unit_count}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* People Tab */}
          <TabsContent value="people" className="p-4 md:p-6 mt-0 space-y-6">
            <BuildingContactsList buildingId={buildingId} managementMode={building?.management_mode || 'weg'} />
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="p-4 md:p-6 mt-0">
            <BuildingReportsTab buildingId={buildingId} managementMode={building.management_mode} />
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="p-4 md:p-6 mt-0">
            <BuildingFilesTab buildingId={buildingId} managementMode={building.management_mode} />
          </TabsContent>

          {/* Forum Tab */}
          <TabsContent value="forum" className="p-4 md:p-6 mt-0">
            <BuildingForumTab buildingId={buildingId} managementMode={building.management_mode} />
          </TabsContent>

          {/* Maintenance Tab */}
          <TabsContent value="maintenance" className="p-4 md:p-6 mt-0">
            <BuildingMaintenanceTab buildingId={buildingId} />
          </TabsContent>

          {/* Distribution Keys Tab */}
          <TabsContent value="distribution" className="p-4 md:p-6 mt-0">
            <BuildingDistributionKeysTab buildingId={buildingId} />
          </TabsContent>

          {/* Finance Tab */}
          <TabsContent value="finance" className="p-4 md:p-6 mt-0">
            <BuildingFinanceSummary buildingId={buildingId} buildingName={building.name} />
          </TabsContent>

          {/* Resolutions Tab (WEG only) */}
          {building.management_mode === 'weg' && (
            <TabsContent value="resolutions" className="p-4 md:p-6 mt-0">
              <BuildingResolutionsTab buildingId={buildingId} />
            </TabsContent>
          )}
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
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
