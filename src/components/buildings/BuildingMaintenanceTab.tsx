import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MaintenanceConfigSection, type MaintenanceConfig } from "./MaintenanceConfigSection";
import { HeatingUnitsManager } from "./HeatingUnitsManager";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save, Wrench } from "lucide-react";

interface BuildingMaintenanceTabProps {
  buildingId: string;
}

export const BuildingMaintenanceTab = ({ buildingId }: BuildingMaintenanceTabProps) => {
  const [configs, setConfigs] = useState<MaintenanceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, [buildingId]);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("maintenance_configs")
        .select("*")
        .eq("building_id", buildingId);

      if (error) throw error;

      setConfigs(
        (data || []).map((c: any) => ({
          maintenance_type: c.maintenance_type,
          is_active: c.is_active,
          custom_interval_months: c.custom_interval_months ?? undefined,
          custom_lead_time_days: c.custom_lead_time_days ?? undefined,
          last_maintenance_date: c.last_maintenance_date ?? undefined,
          custom_label: c.custom_label ?? undefined,
          custom_category: c.custom_category ?? undefined,
        }))
      );
    } catch (error) {
      console.error("Error fetching maintenance configs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Delete existing configs for this building
      await supabase.from("maintenance_configs").delete().eq("building_id", buildingId);

      // Insert active configs
      const activeConfigs = configs.filter((c) => c.is_active);
      if (activeConfigs.length > 0) {
        const { error } = await supabase.from("maintenance_configs").insert(
          activeConfigs.map((c) => ({
            building_id: buildingId,
            maintenance_type: c.maintenance_type,
            is_active: true,
            custom_interval_months: c.custom_interval_months || null,
            custom_lead_time_days: c.custom_lead_time_days || null,
            last_maintenance_date: c.last_maintenance_date || null,
          }))
        );
        if (error) throw error;
      }

      toast.success("Wartungskonfiguration gespeichert");
    } catch (error) {
      console.error("Error saving maintenance configs:", error);
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Wartungskonfiguration</h3>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Speichern..." : "Speichern"}
        </Button>
      </div>

      <MaintenanceConfigSection configs={configs} onChange={setConfigs} />

      <HeatingUnitsManager buildingId={buildingId} />
    </div>
  );
};
