
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MaintenanceConfigSection, type MaintenanceConfig } from "@/components/buildings/MaintenanceConfigSection";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code?: string;
  management_mode: string;
  manager_name?: string;
  unit_count?: number;
}

interface EditBuildingDialogProps {
  building: Building | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const EditBuildingDialog = ({
  building,
  isOpen,
  onClose,
  onUpdate,
}: EditBuildingDialogProps) => {
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    unit_count: ""
  });
  const [loading, setLoading] = useState(false);
  const [maintenanceConfigs, setMaintenanceConfigs] = useState<MaintenanceConfig[]>([]);
  const [initialMaintenanceTypes, setInitialMaintenanceTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (building) {
      setFormData({
        name: building.name || "",
        address: building.address || "",
        unit_count: building.unit_count?.toString() || "0"
      });
      fetchMaintenanceConfigs(building.id);
    }
  }, [building]);

  const fetchMaintenanceConfigs = async (buildingId: string) => {
    try {
      const { data, error } = await supabase
        .from("maintenance_configs")
        .select("*")
        .eq("building_id", buildingId);

      if (error) throw error;

      const configs: MaintenanceConfig[] = (data || []).map((row: any) => ({
        maintenance_type: row.maintenance_type,
        is_active: row.is_active,
        custom_interval_months: row.custom_interval_months,
        custom_lead_time_days: row.custom_lead_time_days,
      }));
      setMaintenanceConfigs(configs);
      setInitialMaintenanceTypes(new Set(configs.filter(c => c.is_active).map(c => c.maintenance_type)));
    } catch (error) {
      console.error("Error fetching maintenance configs:", error);
    }
  };

  const saveMaintenanceConfigs = async (buildingId: string) => {
    // Delete all existing configs for this building
    await supabase.from("maintenance_configs").delete().eq("building_id", buildingId);

    const activeConfigs = maintenanceConfigs.filter(c => c.is_active);
    if (activeConfigs.length === 0) return;

    const rows = activeConfigs.map(c => ({
      building_id: buildingId,
      maintenance_type: c.maintenance_type,
      is_active: true,
      custom_interval_months: c.custom_interval_months || null,
      custom_lead_time_days: c.custom_lead_time_days || null,
    }));

    const { error } = await supabase.from("maintenance_configs").insert(rows);
    if (error) throw error;

    // Check if configs changed to decide if we need to regenerate
    const currentActiveTypes = new Set(activeConfigs.map(c => c.maintenance_type));
    const hasChanges = currentActiveTypes.size !== initialMaintenanceTypes.size ||
      [...currentActiveTypes].some(t => !initialMaintenanceTypes.has(t)) ||
      activeConfigs.some(c => c.custom_interval_months || c.custom_lead_time_days);

    if (hasChanges) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.functions.invoke("generate-maintenance-tasks", {
        body: { building_id: buildingId, user_id: user?.id },
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!building) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("buildings")
        .update({
          name: formData.name,
          address: formData.address,
          unit_count: formData.unit_count ? parseInt(formData.unit_count) : 0,
          updated_at: new Date().toISOString()
        })
        .eq("id", building.id);

      if (error) throw error;

      await saveMaintenanceConfigs(building.id);

      toast.success("Gebäude erfolgreich aktualisiert");
      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating building:", error);
      toast.error("Fehler beim Aktualisieren des Gebäudes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Gebäude bearbeiten</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit_count">Anzahl Einheiten</Label>
              <Input
                id="unit_count"
                type="number"
                min="0"
                value={formData.unit_count}
                onChange={(e) => setFormData({ ...formData, unit_count: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="building_code">Gebäudecode</Label>
              <Input
                id="building_code"
                value={building?.building_code || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Der Gebäudecode kann nicht geändert werden
              </p>
            </div>

            {/* Wartungskonfiguration */}
            <MaintenanceConfigSection
              configs={maintenanceConfigs}
              onChange={setMaintenanceConfigs}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
