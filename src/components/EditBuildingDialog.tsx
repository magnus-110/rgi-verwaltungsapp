import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code?: string;
  management_mode: string;
  manager_name?: string;
  unit_count?: number;
  creditor_id?: string | null;
  billing_only?: boolean;
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
    unit_count: "",
    creditor_id: "",
    billing_only: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (building) {
      setFormData({
        name: building.name || "",
        address: building.address || "",
        unit_count: building.unit_count?.toString() || "0",
        creditor_id: (building as any).creditor_id || "",
        billing_only: (building as any).billing_only || false,
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
          unit_count: formData.unit_count ? parseInt(formData.unit_count) : 0,
          creditor_id: formData.creditor_id.trim() || null,
          billing_only: formData.billing_only,
          updated_at: new Date().toISOString(),
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
            <div className="space-y-2">
              <Label htmlFor="creditor_id">Gläubiger-ID (SEPA Creditor Identifier)</Label>
              <Input
                id="creditor_id"
                value={formData.creditor_id}
                onChange={(e) =>
                  setFormData({ ...formData, creditor_id: e.target.value.toUpperCase() })
                }
                placeholder="z. B. DE98ZZZ09999999999"
                maxLength={35}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Wird im SEPA-Mandat des Eigentümer-Onboardings angezeigt.
              </p>
            </div>

            <div className="flex items-start gap-2 pt-2 border-t">
              <input
                id="billing_only"
                type="checkbox"
                checked={formData.billing_only}
                onChange={(e) => setFormData({ ...formData, billing_only: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-input"
              />
              <div className="flex-1">
                <Label htmlFor="billing_only" className="cursor-pointer">
                  Nur Abrechnung
                </Label>
                <p className="text-xs text-muted-foreground">
                  Für dieses Gebäude wird ausschließlich die Abrechnung erstellt (keine Vollverwaltung).
                </p>
              </div>
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
