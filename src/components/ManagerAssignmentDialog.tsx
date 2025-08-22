
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ManagerAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  buildingId: string;
  buildingName: string;
}

interface AdminUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface AssignedManager {
  manager_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export const ManagerAssignmentDialog = ({ 
  isOpen, 
  onClose, 
  buildingId, 
  buildingName 
}: ManagerAssignmentDialogProps) => {
  const [selectedManagerId, setSelectedManagerId] = useState<string>("");
  const queryClient = useQueryClient();

  // Alle Admin-Nutzer laden
  const { data: adminUsers = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .eq('role', 'admin')
        .order('first_name');

      if (error) throw error;
      return data as AdminUser[];
    },
  });

  // Zugewiesene Verwalter für dieses Gebäude laden mit RPC-Funktion
  const { data: assignedManagers = [] } = useQuery({
    queryKey: ['building-managers', buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_building_managers', { building_id_param: buildingId });

      if (error) {
        console.error('Error fetching assigned managers:', error);
        return [];
      }
      
      return Array.isArray(data) ? data.map((item: any) => ({
        manager_id: item.manager_id,
        user_id: item.user_id,
        first_name: item.first_name || '',
        last_name: item.last_name || '',
        email: item.email
      })) as AssignedManager[] : [];
    },
  });

  const handleAssignManager = async () => {
    if (!selectedManagerId) return;

    try {
      const { error } = await supabase
        .rpc('assign_building_manager', {
          building_id_param: buildingId,
          user_id_param: selectedManagerId
        });

      if (error) throw error;

      toast.success("Verwalter erfolgreich zugewiesen");
      setSelectedManagerId("");
      queryClient.invalidateQueries({ queryKey: ['building-managers', buildingId] });
      queryClient.invalidateQueries({ queryKey: ['building-managers-count', buildingId] });
      queryClient.invalidateQueries({ queryKey: ['building-managers-names', buildingId] });
    } catch (error: any) {
      console.error('Error assigning manager:', error);
      if (error.message?.includes('duplicate')) {
        toast.error("Dieser Verwalter ist bereits diesem Gebäude zugewiesen");
      } else {
        toast.error("Fehler beim Zuweisen des Verwalters");
      }
    }
  };

  const handleRemoveManager = async (managerId: string) => {
    try {
      const { error } = await supabase
        .rpc('remove_building_manager', { manager_id_param: managerId });

      if (error) throw error;

      toast.success("Verwalter-Zuweisung entfernt");
      queryClient.invalidateQueries({ queryKey: ['building-managers', buildingId] });
      queryClient.invalidateQueries({ queryKey: ['building-managers-count', buildingId] });
      queryClient.invalidateQueries({ queryKey: ['building-managers-names', buildingId] });
    } catch (error) {
      console.error('Error removing manager:', error);
      toast.error("Fehler beim Entfernen der Verwalter-Zuweisung");
    }
  };

  // Verfügbare Verwalter (noch nicht zugewiesen)
  const availableManagers = adminUsers.filter(
    admin => !assignedManagers.some(assigned => assigned.user_id === admin.user_id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Verwalter zuweisen - {buildingName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Zugewiesene Verwalter */}
          <div>
            <h4 className="text-sm font-medium mb-3">Zugewiesene Verwalter</h4>
            {assignedManagers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Verwalter zugewiesen</p>
            ) : (
              <div className="space-y-2">
                {assignedManagers.map((manager) => (
                  <div key={manager.manager_id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <div className="font-medium">
                        {manager.first_name} {manager.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {manager.email}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveManager(manager.manager_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Neuen Verwalter hinzufügen */}
          {availableManagers.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3">Verwalter hinzufügen</h4>
              <div className="flex gap-2">
                <Select value={selectedManagerId} onValueChange={setSelectedManagerId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Verwalter auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableManagers.map((admin) => (
                      <SelectItem key={admin.user_id} value={admin.user_id}>
                        {admin.first_name} {admin.last_name} ({admin.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAssignManager}
                  disabled={!selectedManagerId}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Zuweisen
                </Button>
              </div>
            </div>
          )}

          {availableManagers.length === 0 && assignedManagers.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Alle verfügbaren Verwalter sind bereits zugewiesen.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Schließen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
