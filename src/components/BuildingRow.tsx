import { useState } from "react";
import { Building2, MapPin, Hash, Calendar, ChevronDown, ChevronRight, Edit, Plus, Upload } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsersList } from "./UsersList";
import { EditBuildingDialog } from "./EditBuildingDialog";
import { BulkUpload } from "./BulkUpload";
import { CreateUserDialog } from "./CreateUserDialog";
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
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
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

  const totalUsers = (userCounts?.tenants || 0) + (userCounts?.wegOwners || 0);

  const handleUpdate = () => {
    // Refresh building data
    queryClient.invalidateQueries({ queryKey: ['buildings-paginated'] });
    queryClient.invalidateQueries({ queryKey: ['building-user-counts', building.id] });
    onUpdate();
  };

  const handleCreateUser = (userType: "tenant" | "weg_owner") => {
    setSelectedUserType(userType);
    setIsCreateUserDialogOpen(true);
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-lg truncate">{building.name}</h3>
                <Badge variant="outline" className="text-xs">
                  {building.management_mode.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center text-muted-foreground text-sm mt-1">
                <MapPin className="h-3 w-3 mr-1" />
                <span className="truncate">{building.address}</span>
              </div>
              <div className="flex items-center space-x-4 text-xs text-muted-foreground mt-2">
                {building.building_code && (
                  <div className="flex items-center">
                    <Hash className="h-3 w-3 mr-1" />
                    {building.building_code}
                  </div>
                )}
                <div className="flex items-center">
                  <Calendar className="h-3 w-3 mr-1" />
                  {new Date(building.created_at).toLocaleDateString('de-DE')}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">
              {totalUsers} Nutzer
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditDialogOpen(true)}
              className="h-8 w-8 p-0"
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
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
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm text-muted-foreground">Zugewiesene Nutzer</h4>
              <div className="flex items-center space-x-2">
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
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Mieter
                  </Button>
                )}
                {building.management_mode === "weg" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCreateUser("weg_owner")}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    WEG-Eigentümer
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
    </Card>
  );
};
