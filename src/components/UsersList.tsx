
import { useState } from "react";
import { ChevronDown, ChevronRight, Users, Mail, Phone, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EditUserDialog } from "./EditUserDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";

interface User {
  id: string;
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  created_at: string;
}

interface UsersListProps {
  buildingId: string;
  userType: 'tenants' | 'weg_owners';
  count: number;
}

export const UsersList = ({ buildingId, userType, count }: UsersListProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const pageSize = 10;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['building-users', buildingId, userType, page],
    queryFn: async () => {
      if (userType === 'tenants') {
        const { data, error } = await supabase
          .from('tenants')
          .select('user_id, email, first_name, last_name, phone, created_at')
          .eq('building_id', buildingId)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        return (data || []).map(user => ({ ...user, id: user.user_id, user_id: user.user_id }));
      } else {
        // For WEG owners, first get the user_ids from junction table
        const { data: junctionData, error: junctionError } = await supabase
          .from('weg_owner_buildings')
          .select('user_id')
          .eq('building_id', buildingId)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (junctionError) throw junctionError;
        
        if (!junctionData || junctionData.length === 0) {
          return [];
        }
        
        const userIds = junctionData.map(item => item.user_id);
        
        // Then get the weg_owners data for these user_ids
        const { data, error } = await supabase
          .from('weg_owners')
          .select('user_id, email, first_name, last_name, phone, created_at')
          .in('user_id', userIds);
        
        if (error) throw error;
        return (data || []).map(user => ({ ...user, id: user.user_id, user_id: user.user_id }));
      }
    },
    enabled: isExpanded,
  });

  const title = userType === 'tenants' ? 'Mieter' : 'WEG-Eigentümer';
  const Icon = Users;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      setPage(0); // Reset to first page when expanding
    }
  };

  const hasMore = users.length === pageSize;
  const canLoadPrevious = page > 0;

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsEditDialogOpen(true);
  };

  const handleDeleteUser = (user: User) => {
    setDeletingUser(user);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!deletingUser) return;

    try {
      if (userType === 'tenants') {
        // Delete from tenants table
        const { error } = await supabase
          .from('tenants')
          .delete()
          .eq('user_id', deletingUser.user_id);
        
        if (error) throw error;
        toast.success("Mieter wurde erfolgreich entfernt");
      } else {
        // Delete from weg_owner_buildings table (only the building assignment)
        const { error } = await supabase
          .from('weg_owner_buildings')
          .delete()
          .eq('user_id', deletingUser.user_id)
          .eq('building_id', buildingId);
        
        if (error) throw error;
        toast.success("WEG-Eigentümer wurde erfolgreich vom Gebäude entfernt");
      }
      
      handleUpdate();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error("Fehler beim Löschen des Benutzers");
    } finally {
      setIsDeleteDialogOpen(false);
      setDeletingUser(null);
    }
  };

  const handleUpdate = () => {
    // Refresh user data
    queryClient.invalidateQueries({ queryKey: ['building-users', buildingId, userType] });
    queryClient.invalidateQueries({ queryKey: ['building-user-counts', buildingId] });
  };

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        className="w-full justify-start p-2 h-auto"
        onClick={handleToggle}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 mr-2" />
        ) : (
          <ChevronRight className="h-4 w-4 mr-2" />
        )}
        <Icon className="h-4 w-4 mr-2" />
        <span className="font-medium">{title}</span>
        <Badge variant="secondary" className="ml-2">
          {count}
        </Badge>
      </Button>

      {isExpanded && (
        <Card className="p-4 ml-6">
          {isLoading ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Lädt...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Keine {title.toLowerCase()} gefunden
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-2 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">
                      {user.first_name && user.last_name 
                        ? `${user.first_name} ${user.last_name}`
                        : 'Name nicht angegeben'
                      }
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground mt-1">
                      <Mail className="h-3 w-3 mr-1" />
                      {user.email}
                      {user.phone && (
                        <>
                          <Phone className="h-3 w-3 ml-3 mr-1" />
                          {user.phone}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString('de-DE')}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteUser(user)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Pagination Controls */}
              {(hasMore || canLoadPrevious) && (
                <div className="flex justify-between items-center pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={!canLoadPrevious}
                  >
                    Vorherige
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Seite {page + 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={!hasMore}
                  >
                    Nächste
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
      
      <EditUserDialog
        user={editingUser}
        userType={userType}
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditingUser(null);
        }}
        onUpdate={handleUpdate}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {userType === 'tenants' ? 'Mieter löschen' : 'WEG-Eigentümer entfernen'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {userType === 'tenants' 
                ? `Sind Sie sicher, dass Sie den Mieter "${deletingUser?.first_name} ${deletingUser?.last_name}" (${deletingUser?.email}) vollständig löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.`
                : `Sind Sie sicher, dass Sie den WEG-Eigentümer "${deletingUser?.first_name} ${deletingUser?.last_name}" (${deletingUser?.email}) von diesem Gebäude entfernen möchten?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {userType === 'tenants' ? 'Löschen' : 'Entfernen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
