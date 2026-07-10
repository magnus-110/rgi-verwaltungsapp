import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useManagementMode } from "@/hooks/useManagementMode";
import { MaintenanceConfigSection, type MaintenanceConfig } from "@/components/buildings/MaintenanceConfigSection";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CreateBuildingDialogProps {
  onBuildingCreated?: () => void;
}

interface AdminUser {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export const CreateBuildingDialog = ({ onBuildingCreated }: CreateBuildingDialogProps) => {
  const { managementMode } = useManagementMode();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [maintenanceConfigs, setMaintenanceConfigs] = useState<MaintenanceConfig[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city: "",
    type: "weg",
    manager_id: "unassigned",
    unit_count: ""
  });

  useEffect(() => {
    if (isOpen) {
      fetchAdminUsers();
    }
  }, [isOpen]);

  const fetchAdminUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .eq("role", "admin")
        .order("first_name");

      if (error) throw error;
      setAdminUsers(data || []);
    } catch (error) {
      console.error("Error fetching admin users:", error);
    }
  };

  const saveMaintenanceConfigs = async (buildingId: string) => {
    const activeConfigs = maintenanceConfigs.filter(c => c.is_active);
    if (activeConfigs.length === 0) return;

    const rows = activeConfigs.map(c => ({
      building_id: buildingId,
      maintenance_type: c.maintenance_type,
      is_active: true,
      custom_interval_months: c.custom_interval_months || null,
      custom_lead_time_days: c.custom_lead_time_days || null,
      last_maintenance_date: c.last_maintenance_date || null,
      custom_label: c.custom_label || null,
      custom_category: c.custom_category || null,
    }));

    const { error } = await supabase.from("maintenance_configs").insert(rows);
    if (error) throw error;

    // Trigger task generation
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.functions.invoke("generate-maintenance-tasks", {
      body: { building_id: buildingId, user_id: user?.id },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: buildingData, error: buildingError } = await supabase
        .from("buildings")
        .insert({
          name: formData.name,
          address: formData.address,
          city: formData.city || null,
          management_mode: managementMode,
          type: formData.type,
          unit_count: formData.unit_count ? parseInt(formData.unit_count) : 0,
          building_code: ""
        } as any)
        .select()
        .single();

      if (buildingError) throw buildingError;

      if (formData.manager_id && formData.manager_id !== "unassigned") {
        const { error: managerError } = await supabase
          .from("building_managers")
          .insert({
            building_id: buildingData.id,
            user_id: formData.manager_id
          });

        if (managerError) throw managerError;
      }

      // Save maintenance configs and generate tasks
      await saveMaintenanceConfigs(buildingData.id);

      toast.success("Gebäude erfolgreich erstellt");
      setIsOpen(false);
      setFormData({ name: "", address: "", city: "", type: "weg", manager_id: "unassigned", unit_count: "" });
      setMaintenanceConfigs([]);
      onBuildingCreated?.();
    } catch (error) {
      console.error("Error creating building:", error);
      toast.error("Fehler beim Erstellen des Gebäudes");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="outline" className="h-8 w-8" title="Gebäude hinzufügen">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Neues Gebäude erstellen</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Gebäudename</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="address">Adresse (Straße + Nr.)</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ort</Label>
                <Input
                  id="city"
                  placeholder="z.B. Pfronten"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manager_id">Zuständiger Verwalter</Label>
              <Select value={formData.manager_id} onValueChange={(value) => setFormData(prev => ({ ...prev, manager_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Admin-Account auswählen (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Keinen Verwalter zuweisen</SelectItem>
                  {adminUsers.map((admin) => (
                    <SelectItem key={admin.user_id} value={admin.user_id}>
                      {admin.first_name && admin.last_name 
                        ? `${admin.first_name} ${admin.last_name} (${admin.email})`
                        : admin.email
                      }
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="unit_count">Anzahl Einheiten</Label>
              <Input
                id="unit_count"
                type="number"
                min="0"
                placeholder="z.B. 12"
                value={formData.unit_count}
                onChange={(e) => setFormData(prev => ({ ...prev, unit_count: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Typ</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weg">WEG</SelectItem>
                  <SelectItem value="miete">Miete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Wartungskonfiguration */}
            <MaintenanceConfigSection
              configs={maintenanceConfigs}
              onChange={setMaintenanceConfigs}
            />
            
            <div className="flex justify-end space-x-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Erstelle..." : "Erstellen"}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
