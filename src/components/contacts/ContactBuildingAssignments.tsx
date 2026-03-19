import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Building2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Assignment {
  id: string;
  contact_id: string;
  building_id: string;
  unit_number: string | null;
  floor_location: string | null;
  role_in_building: string | null;
  building?: { id: string; name: string; address: string; building_code: string };
}

const ROLES: Record<string, string> = {
  eigentuemer: "Eigentümer",
  mieter: "Mieter",
  verwalter: "Verwalter",
  beirat: "Beirat",
};

interface Props {
  contactId: string;
}

export function ContactBuildingAssignments({ contactId }: Props) {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [buildings, setBuildings] = useState<{ id: string; name: string; address: string }[]>([]);
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");

  useEffect(() => { load(); }, [contactId]);

  const load = async () => {
    const [assignRes, buildingsRes] = await Promise.all([
      supabase.from("contact_building_assignments")
        .select("id, contact_id, building_id, unit_number, floor_location, role_in_building, building:buildings(id, name, address, building_code)")
        .eq("contact_id", contactId)
        .order("created_at"),
      supabase.from("buildings").select("id, name, address").order("name"),
    ]);
    setAssignments((assignRes.data || []) as unknown as Assignment[]);
    setBuildings(buildingsRes.data || []);
  };

  const addAssignment = async () => {
    if (!selectedBuildingId) return;
    const { error } = await supabase.from("contact_building_assignments").insert({
      contact_id: contactId,
      building_id: selectedBuildingId,
    });
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else {
      setShowAddBuilding(false);
      setSelectedBuildingId("");
      load();
    }
  };

  const deleteAssignment = async (id: string) => {
    await supabase.from("contact_building_assignments").delete().eq("id", id);
    load();
  };

  const assignedBuildingIds = assignments.map(a => a.building_id);
  const availableBuildings = buildings.filter(b => !assignedBuildingIds.includes(b.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Gebäude-Zuordnungen
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowAddBuilding(true)}>
          <Plus className="h-3 w-3 mr-1" /> Gebäude zuordnen
        </Button>
      </div>

      {showAddBuilding && (
        <Card>
          <CardContent className="pt-4 flex items-end gap-3">
            <div className="flex-1">
              <Label>Gebäude auswählen</Label>
              <Select value={selectedBuildingId} onValueChange={setSelectedBuildingId}>
                <SelectTrigger><SelectValue placeholder="Gebäude wählen..." /></SelectTrigger>
                <SelectContent>
                  {availableBuildings.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name} — {b.address}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={addAssignment} disabled={!selectedBuildingId}>Zuordnen</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddBuilding(false)}>Abbrechen</Button>
          </CardContent>
        </Card>
      )}

      {assignments.length === 0 && !showAddBuilding && (
        <p className="text-sm text-muted-foreground">Keinem Gebäude zugeordnet</p>
      )}

      {assignments.map((a) => (
        <Card key={a.id}>
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{a.building?.name || "Gebäude"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[a.building?.address, a.unit_number ? `Einheit ${a.unit_number}` : null, a.floor_location].filter(Boolean).join(" · ")}
                </p>
              </div>
              {a.role_in_building && (
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {ROLES[a.role_in_building] || a.role_in_building}
                </Badge>
              )}
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteAssignment(a.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
