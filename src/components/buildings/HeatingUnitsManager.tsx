import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Flame, Edit2 } from "lucide-react";
import { toast } from "sonner";

const FUEL_TYPES = [
  { value: "oil", label: "Heizöl", unit: "l" },
  { value: "pellets", label: "Pellets", unit: "kg" },
  { value: "gas", label: "Gas", unit: "kWh" },
  { value: "district_heating", label: "Fernwärme", unit: "kWh" },
];

interface HeatingUnitsManagerProps {
  buildingId: string;
}

export const HeatingUnitsManager = ({ buildingId }: HeatingUnitsManagerProps) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", fuel_type: "oil", tank_capacity: "", notes: "" });

  const { data: units = [] } = useQuery({
    queryKey: ["heating-units", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heating_units")
        .select("*")
        .eq("building_id", buildingId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const reset = () => {
    setForm({ name: "", fuel_type: "oil", tank_capacity: "", notes: "" });
    setEditingId(null);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Bitte Namen angeben"); return; }
    const payload = {
      building_id: buildingId,
      name: form.name.trim(),
      fuel_type: form.fuel_type,
      tank_capacity: form.tank_capacity ? parseFloat(form.tank_capacity) : null,
      notes: form.notes || null,
    };
    const { error } = editingId
      ? await supabase.from("heating_units").update(payload).eq("id", editingId)
      : await supabase.from("heating_units").insert(payload);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success(editingId ? "Heizkreis aktualisiert" : "Heizkreis angelegt");
    setIsOpen(false);
    reset();
    queryClient.invalidateQueries({ queryKey: ["heating-units"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Heizkreis wirklich löschen? Zugeordnete Brennstoff-Einträge bleiben erhalten, verlieren aber die Zuordnung.")) return;
    const { error } = await supabase.from("heating_units").delete().eq("id", id);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Heizkreis gelöscht");
    queryClient.invalidateQueries({ queryKey: ["heating-units"] });
  };

  const startEdit = (u: any) => {
    setEditingId(u.id);
    setForm({
      name: u.name,
      fuel_type: u.fuel_type,
      tank_capacity: u.tank_capacity?.toString() || "",
      notes: u.notes || "",
    });
    setIsOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-5 w-5" /> Heizkreise / Tanks
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Bei mehreren Häusern mit separaten Heizungsanlagen / Öltanks getrennt erfassen
          </p>
        </div>
        <Button size="sm" onClick={() => { reset(); setIsOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Heizkreis
        </Button>
      </CardHeader>
      <CardContent>
        {units.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Noch kein Heizkreis angelegt. Bei nur einer Heizungsanlage muss nichts konfiguriert werden — Brennstoffeinträge werden automatisch ohne Heizkreis-Zuordnung gespeichert.
          </p>
        ) : (
          <div className="space-y-2">
            {units.map((u: any) => {
              const ft = FUEL_TYPES.find(f => f.value === u.fuel_type);
              return (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-md border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{u.name}</span>
                      <Badge variant="outline" className="text-xs">{ft?.label || u.fuel_type}</Badge>
                      {u.tank_capacity && (
                        <span className="text-xs text-muted-foreground">Kapazität: {u.tank_capacity} {ft?.unit}</span>
                      )}
                    </div>
                    {u.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{u.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(u)}>
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(u.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Heizkreis bearbeiten" : "Neuer Heizkreis"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Bezeichnung *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="z.B. Haus A — Tank Nord"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Brennstoffart</Label>
                <Select value={form.fuel_type} onValueChange={(v) => setForm(p => ({ ...p, fuel_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FUEL_TYPES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tank-Kapazität (optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.tank_capacity}
                  onChange={(e) => setForm(p => ({ ...p, tank_capacity: e.target.value }))}
                  placeholder={`in ${FUEL_TYPES.find(f => f.value === form.fuel_type)?.unit}`}
                />
              </div>
            </div>
            <div>
              <Label>Notiz (optional)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="z.B. Standort, Heizungsbauer"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsOpen(false); reset(); }}>Abbrechen</Button>
            <Button onClick={save}>{editingId ? "Speichern" : "Anlegen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
