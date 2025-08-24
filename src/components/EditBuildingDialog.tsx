
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code?: string;
  management_mode: string;
  manager_name?: string;
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
    building_code: ""
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (building) {
      setFormData({
        name: building.name || "",
        address: building.address || "",
        building_code: building.building_code || ""
      });
    }
  }, [building]);

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
          building_code: formData.building_code,
          updated_at: new Date().toISOString()
        })
        .eq("id", building.id);

      if (error) throw error;

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gebäude bearbeiten</DialogTitle>
        </DialogHeader>
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
            <Label htmlFor="building_code">Gebäudecode</Label>
            <Input
              id="building_code"
              value={formData.building_code}
              onChange={(e) => setFormData({ ...formData, building_code: e.target.value })}
            />
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
