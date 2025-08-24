
import { useState } from "react";
import { Building2, MapPin, Hash, Calendar, ChevronDown, ChevronRight, Edit, Plus, Upload, Users, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsersList } from "./UsersList";
import { EditBuildingDialog } from "./EditBuildingDialog";
import { DeleteBuildingDialog } from "./DeleteBuildingDialog";
import { BulkUpload } from "./BulkUpload";
import { CreateUserDialog } from "./CreateUserDialog";
import { ManagerAssignmentDialog } from "./ManagerAssignmentDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code?: string;
  created_at: string;
  management_mode: "weg" | "rent";
}

interface BuildingRowProps {
  building: Building;
  onUpdate: () => void;
}

export const BuildingRow = ({ building, onUpdate }: BuildingRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isManagerDialogOpen, setIsManagerDialogOpen] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState<"tenant" | "weg_owner">("tenant");
  const queryClient = useQueryClient();

  // Get user counts for this building
  const { data: userCounts } = useQuery({
    queryKey: ['building-user-counts', building.id],
    queryFn: async () => {
      const [tenantsResult, wegOwnersResult] = await Promise.all([
        supabase
          .from('tenants')
          .select('user_id', { count: 'exact', head: true })
          .eq('building_id', building.id),
        supabase
          .from('weg_owner_buildings')
          .select('user_id', { count: 'exact', head: true })
          .eq('building_id', building.id)
      ]);

      return {
        tenants: tenantsResult.count || 0,
        wegOwners: wegOwnersResult.count || 0
      };
    },
  });

  // Get assigned managers count for this building
  const { data: assignedManagersCount = 0 } = useQuery({
    queryKey: ['building-managers-count', building.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('count_building_managers', { building_id_param: building.id });

      if (error) {
        console.error('Error counting managers:', error);
        return 0;
      }
      return data || 0;
    },
  });

  // Get manager names for display using a custom query
  const { data: managerNames = [] } = useQuery({
    queryKey: ['building-managers-names', building.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_building_manager_names', { building_id_param: building.id });

      if (error) {
        console.error('Error fetching manager names:', error);
        return [];
      }
      
      return data || [];
    },
  });

  const totalUsers = (userCounts?.tenants || 0) + (userCounts?.wegOwners || 0);

  const handleUpdate = () => {
    // Refresh building data
    queryClient.invalidateQueries({ queryKey: ['buildings-paginated'] });
    queryClient.invalidateQueries({ queryKey: ['building-user-counts', building.id] });
    queryClient.invalidateQueries({ queryKey: ['building-managers-count', building.id] });
    queryClient.invalidateQueries({ queryKey: ['building-managers-names', building.id] });
    onUpdate();
  };

  const handleCreateUser = (userType: "tenant" | "weg_owner") => {
    setSelectedUserType(userType);
    setIsCreateUserDialogOpen(true);
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <h3 className="font-semibold text-base sm:text-lg truncate">{building.name}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {building.management_mode.toUpperCase()}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {totalUsers} Nutzer
                  </Badge>
                  {assignedManagersCount > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {assignedManagersCount} Verwalter
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center text-muted-foreground text-sm mt-1">
                <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                <span className="truncate">{building.address}</span>
              </div>
              
              {/* Verwalter anzeigen */}
              {Array.isArray(managerNames) && managerNames.length > 0 && (
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  <Users className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate">
                    Verwalter: {managerNames.join(', ')}
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                {building.building_code && (
                  <div className="flex items-center">
                    <Hash className="h-3 w-3 mr-1" />
                    <span className="truncate">{building.building_code}</span>
                  </div>
                )}
                <div className="flex items-center">
                  <Calendar className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">{new Date(building.created_at).toLocaleDateString('de-DE')}</span>
                  <span className="sm:hidden">{new Date(building.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsManagerDialogOpen(true);
              }}
              className="h-9 w-9 sm:h-8 sm:w-8 p-0"
              title="Verwalter zuweisen"
            >
              <Users className="h-4 w-4 sm:h-3 sm:w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditDialogOpen(true);
              }}
              className="h-9 w-9 sm:h-8 sm:w-8 p-0"
              title="Bearbeiten"
            >
              <Edit className="h-4 w-4 sm:h-3 sm:w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteDialogOpen(true);
              }}
              className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              title="Löschen"
            >
              <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="h-9 w-9 sm:h-8 sm:w-8 p-0"
              title={isExpanded ? "Zuklappen" : "Aufklappen"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-medium text-sm text-muted-foreground">Zugewiesene Nutzer</h4>
                <div className="flex items-center gap-2">
                  <BulkUpload 
                    buildingId={building.id}
                    managementMode={building.management_mode}
                    onUploadComplete={handleUpdate}
                  />
                  {building.management_mode === "rent" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCreateUser("tenant")}
                      className="h-9 text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Mieter</span>
                      <span className="sm:hidden">+M</span>
                    </Button>
                  )}
                  {building.management_mode === "weg" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCreateUser("weg_owner")}
                      className="h-9 text-xs"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">WEG-Eigentümer</span>
                      <span className="sm:hidden">+E</span>
                    </Button>
                  )}
                </div>
              </div>
            <div className="space-y-2">
              {userCounts?.tenants > 0 && (
                <UsersList
                  buildingId={building.id}
                  userType="tenants"
                  count={userCounts.tenants}
                />
              )}
              {userCounts?.wegOwners > 0 && (
                <UsersList
                  buildingId={building.id}
                  userType="weg_owners"
                  count={userCounts.wegOwners}
                />
              )}
              {totalUsers === 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Keine Nutzer zugewiesen
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
      
      <EditBuildingDialog
        building={building}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onUpdate={handleUpdate}
      />
      
      <CreateUserDialog
        isOpen={isCreateUserDialogOpen}
        onClose={() => setIsCreateUserDialogOpen(false)}
        buildingId={building.id}
        userType={selectedUserType}
        onUserCreated={handleUpdate}
      />

      <ManagerAssignmentDialog
        isOpen={isManagerDialogOpen}
        onClose={() => setIsManagerDialogOpen(false)}
        buildingId={building.id}
        buildingName={building.name}
      />

      <DeleteBuildingDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        buildingId={building.id}
        buildingName={building.name}
        buildingCode={building.building_code}
        onDelete={handleUpdate}
      />
    </Card>
  );
};
