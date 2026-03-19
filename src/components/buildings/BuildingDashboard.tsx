import { useState } from "react";
import { Building2, MapPin, Hash, Edit, Trash2, Users, FileText, AlertCircle, Newspaper, Wrench, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EditBuildingDialog } from "@/components/EditBuildingDialog";
import { DeleteBuildingDialog } from "@/components/DeleteBuildingDialog";
import { ManagerAssignmentDialog } from "@/components/ManagerAssignmentDialog";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { BulkUpload } from "@/components/BulkUpload";
import { UsersList } from "@/components/UsersList";
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
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState<"tenant" | "weg_owner">("tenant");
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

  const { data: userCounts } = useQuery({
    queryKey: ['building-user-counts', buildingId],
    queryFn: async () => {
      const [tenantsResult, wegOwnersResult] = await Promise.all([
        supabase.from('tenants').select('user_id', { count: 'exact', head: true }).eq('building_id', buildingId),
        supabase.from('weg_owner_buildings').select('user_id', { count: 'exact', head: true }).eq('building_id', buildingId),
      ]);
      return {
        tenants: tenantsResult.count || 0,
        wegOwners: wegOwnersResult.count || 0,
      };
    },
  });

  const { data: reportCount = 0 } = useQuery({
    queryKey: ['building-report-count', buildingId, building?.management_mode],
    queryFn: async () => {
      if (!building) return 0;
      const table = building.management_mode === 'weg' ? 'weg_reports' : 'miete_reports';
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('building_id', buildingId)
        .eq('status', 'open');
      if (error) return 0;
      return count || 0;
    },
    enabled: !!building,
  });

  const { data: fileCount = 0 } = useQuery({
    queryKey: ['building-file-count', buildingId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('building_files')
        .select('*', { count: 'exact', head: true })
        .eq('building_id', buildingId);
      if (error) return 0;
      return count || 0;
    },
  });

  const { data: forumCount = 0 } = useQuery({
    queryKey: ['building-forum-count', buildingId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('forum_posts')
        .select('*', { count: 'exact', head: true })
        .eq('building_id', buildingId);
      if (error) return 0;
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
    queryClient.invalidateQueries({ queryKey: ['building-user-counts', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-report-count', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-file-count', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-forum-count', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['building-managers-names', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['buildings-list'] });
  };

  const handleCreateUser = (type: "tenant" | "weg_owner") => {
    setSelectedUserType(type);
    setIsCreateUserOpen(true);
  };

  const totalUsers = (userCounts?.tenants || 0) + (userCounts?.wegOwners || 0);

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
              <div className="flex items-center text-sm text-muted-foreground mt-0.5">
                <MapPin className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                <span className="truncate">{building.address}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  <Hash className="h-3 w-3 mr-1" />
                  {building.building_code}
                </Badge>
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
        <div className="border-b border-border px-4 md:px-6 bg-card">
          <TabsList className="h-auto p-0 bg-transparent gap-0">
            <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm">
              Übersicht
            </TabsTrigger>
            <TabsTrigger value="people" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm">
              Personen
            </TabsTrigger>
            <TabsTrigger value="reports" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm">
              Meldungen
            </TabsTrigger>
            <TabsTrigger value="documents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm">
              Dokumente
            </TabsTrigger>
            <TabsTrigger value="forum" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm">
              Schwarzes Brett
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-sm">
              Wartung
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          {/* Overview Tab */}
          <TabsContent value="overview" className="p-4 md:p-6 mt-0 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Personen" value={totalUsers} color="text-blue-600" />
              <StatCard icon={AlertCircle} label="Offene Meldungen" value={reportCount} color="text-orange-600" />
              <StatCard icon={FileText} label="Dokumente" value={fileCount} color="text-emerald-600" />
              <StatCard icon={Newspaper} label="Beiträge" value={forumCount} color="text-purple-600" />
            </div>

            {/* Quick info sections */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Personen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {building.management_mode === 'weg' ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">WEG-Eigentümer</span>
                      <span className="font-medium">{userCounts?.wegOwners || 0}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Mieter</span>
                      <span className="font-medium">{userCounts?.tenants || 0}</span>
                    </div>
                  )}
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
                    <span className="text-muted-foreground">Verwaltungsart</span>
                    <span className="font-medium">{building.management_mode === 'weg' ? 'WEG-Verwaltung' : 'Mietverwaltung'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Einheiten</span>
                    <span className="font-medium">{building.unit_count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Erstellt am</span>
                    <span className="font-medium">{new Date(building.created_at!).toLocaleDateString('de-DE')}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* People Tab */}
          <TabsContent value="people" className="p-4 md:p-6 mt-0 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-lg">Zugewiesene Nutzer</h3>
              <div className="flex items-center gap-2">
                <BulkUpload
                  buildingId={buildingId}
                  managementMode={building.management_mode}
                  onUploadComplete={handleRefresh}
                />
                {building.management_mode === "rent" && (
                  <Button size="sm" variant="outline" onClick={() => handleCreateUser("tenant")}>
                    + Mieter
                  </Button>
                )}
                {building.management_mode === "weg" && (
                  <Button size="sm" variant="outline" onClick={() => handleCreateUser("weg_owner")}>
                    + WEG-Eigentümer
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {(userCounts?.tenants || 0) > 0 && (
                <UsersList buildingId={buildingId} userType="tenants" count={userCounts!.tenants} />
              )}
              {(userCounts?.wegOwners || 0) > 0 && (
                <UsersList buildingId={buildingId} userType="weg_owners" count={userCounts!.wegOwners} />
              )}
              {totalUsers === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Keine Nutzer zugewiesen
                </div>
              )}
            </div>
          </TabsContent>

          {/* Placeholder tabs for Iteration 2+ */}
          <TabsContent value="reports" className="p-4 md:p-6 mt-0">
            <PlaceholderTab icon={AlertCircle} title="Meldungen" description="Meldungen für dieses Gebäude werden in Iteration 2 integriert." count={reportCount} />
          </TabsContent>

          <TabsContent value="documents" className="p-4 md:p-6 mt-0">
            <PlaceholderTab icon={FileText} title="Dokumente" description="Dokumentenverwaltung wird in Iteration 2 integriert." count={fileCount} />
          </TabsContent>

          <TabsContent value="forum" className="p-4 md:p-6 mt-0">
            <PlaceholderTab icon={Newspaper} title="Schwarzes Brett" description="Das Schwarze Brett wird in Iteration 3 integriert." count={forumCount} />
          </TabsContent>

          <TabsContent value="maintenance" className="p-4 md:p-6 mt-0">
            <PlaceholderTab icon={Wrench} title="Wartung" description="Wartungskonfiguration wird in Iteration 3 integriert." />
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* Dialogs */}
      <EditBuildingDialog building={building} isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} onUpdate={handleRefresh} />
      <DeleteBuildingDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} buildingId={buildingId}
        buildingName={building.name} buildingCode={building.building_code} onDelete={() => { handleRefresh(); navigate('/buildings'); }} />
      <ManagerAssignmentDialog isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)} buildingId={buildingId} buildingName={building.name} />
      <CreateUserDialog isOpen={isCreateUserOpen} onClose={() => setIsCreateUserOpen(false)} buildingId={buildingId}
        userType={selectedUserType} onUserCreated={handleRefresh} />
    </div>
  );
};

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted ${color}`}>
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

function PlaceholderTab({ icon: Icon, title, description, count }: { icon: any; title: string; description: string; count?: number }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="p-3 bg-muted rounded-xl mb-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-1">{title}</h3>
        {count !== undefined && <p className="text-sm text-muted-foreground mb-2">{count} Einträge vorhanden</p>}
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </CardContent>
    </Card>
  );
}
