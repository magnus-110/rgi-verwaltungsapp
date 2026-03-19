import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Building2, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const USAGE_TYPES = [
  { value: "selbstbewohnt", label: "Selbstbewohnt" },
  { value: "zweitwohnsitz", label: "Zweitwohnsitz" },
  { value: "vermietet", label: "Vermietet" },
  { value: "fewo", label: "Ferienwohnung" },
  { value: "leerstand", label: "Leerstand" },
];

const ROLES = [
  { value: "eigentuemer", label: "Eigentümer" },
  { value: "mieter", label: "Mieter" },
  { value: "verwalter", label: "Verwalter" },
  { value: "beirat", label: "Beirat" },
];

const SHARE_TYPES = [
  { value: "mea", label: "MEA" },
  { value: "einheit", label: "Einheit" },
  { value: "qm", label: "Quadratmeter" },
  { value: "personen", label: "Personen" },
  { value: "garagen", label: "Garagen" },
  { value: "stellplaetze", label: "Stellplätze" },
  { value: "wasser", label: "Wasser" },
  { value: "warmwasser", label: "Warmwasser" },
  { value: "heizkosten", label: "Heizkosten" },
];

interface Assignment {
  id: string;
  contact_id: string;
  building_id: string;
  unit_number: string | null;
  floor_location: string | null;
  usage_type: string | null;
  usage_since: string | null;
  role_in_building: string | null;
  bank_account_id: string | null;
  notes: string | null;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  building?: { id: string; name: string; address: string; building_code: string };
}

interface Share {
  id: string;
  assignment_id: string;
  share_type: string;
  share_value: number;
}

interface Cost {
  id: string;
  assignment_id: string;
  cost_type: string;
  amount: number;
  interval: string;
  valid_from: string | null;
  valid_to: string | null;
}

interface BankAccount {
  id: string;
  account_holder: string | null;
  iban: string | null;
  sepa_mandate_ref: string | null;
}

const COST_TYPES = ["Hausgeld", "Rücklage", "Sonderumlage", "Heizkosten", "Nebenkosten", "Miete", "Stellplatz", "Garage"];
const INTERVALS = [
  { value: "monatlich", label: "Monatlich" },
  { value: "quartal", label: "Quartalsweise" },
  { value: "jaehrlich", label: "Jährlich" },
];

interface Props {
  contactId: string;
}

export function ContactBuildingAssignments({ contactId }: Props) {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [shares, setShares] = useState<Record<string, Share[]>>({});
  const [costs, setCosts] = useState<Record<string, Cost[]>>({});
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [buildings, setBuildings] = useState<{ id: string; name: string; address: string }[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState("");

  useEffect(() => { load(); }, [contactId]);

  const load = async () => {
    const [assignRes, buildingsRes, banksRes] = await Promise.all([
      supabase.from("contact_building_assignments").select("*, building:buildings(id, name, address, building_code)").eq("contact_id", contactId).order("created_at"),
      supabase.from("buildings").select("id, name, address").order("name"),
      supabase.from("contact_bank_accounts").select("id, account_holder, iban, sepa_mandate_ref").eq("contact_id", contactId),
    ]);
    const assignData = (assignRes.data || []) as unknown as Assignment[];
    setAssignments(assignData);
    setBuildings(buildingsRes.data || []);
    setBankAccounts((banksRes.data || []) as BankAccount[]);

    // Load shares and costs for all assignments
    if (assignData.length > 0) {
      const ids = assignData.map(a => a.id);
      const [sharesRes, costsRes] = await Promise.all([
        supabase.from("contact_building_shares").select("*").in("assignment_id", ids),
        supabase.from("contact_building_costs").select("*").in("assignment_id", ids),
      ]);
      const groupedShares: Record<string, Share[]> = {};
      (sharesRes.data || []).forEach((s: any) => {
        if (!groupedShares[s.assignment_id]) groupedShares[s.assignment_id] = [];
        groupedShares[s.assignment_id].push(s as Share);
      });
      setShares(groupedShares);

      const groupedCosts: Record<string, Cost[]> = {};
      (costsRes.data || []).forEach((c: any) => {
        if (!groupedCosts[c.assignment_id]) groupedCosts[c.assignment_id] = [];
        groupedCosts[c.assignment_id].push(c as Cost);
      });
      setCosts(groupedCosts);
    } else {
      setShares({});
      setCosts({});
    }
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

  const updateAssignment = async (id: string, field: string, value: any) => {
    await supabase.from("contact_building_assignments").update({ [field]: value || null }).eq("id", id);
    load();
  };

  const deleteAssignment = async (id: string) => {
    await supabase.from("contact_building_assignments").delete().eq("id", id);
    load();
  };

  // Shares
  const addShare = async (assignmentId: string) => {
    await supabase.from("contact_building_shares").insert({ assignment_id: assignmentId, share_type: "mea", share_value: 0 });
    load();
  };
  const updateShare = async (id: string, field: string, value: any) => {
    await supabase.from("contact_building_shares").update({ [field]: value }).eq("id", id);
    load();
  };
  const deleteShare = async (id: string) => {
    await supabase.from("contact_building_shares").delete().eq("id", id);
    load();
  };

  // Costs
  const addCost = async (assignmentId: string) => {
    await supabase.from("contact_building_costs").insert({ assignment_id: assignmentId, cost_type: "Hausgeld", amount: 0, interval: "monatlich" });
    load();
  };
  const updateCost = async (id: string, field: string, value: any) => {
    await supabase.from("contact_building_costs").update({ [field]: value }).eq("id", id);
    load();
  };
  const deleteCost = async (id: string) => {
    await supabase.from("contact_building_costs").delete().eq("id", id);
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

      {assignments.map((a) => {
        const isExpanded = expanded === a.id;
        const assignmentShares = shares[a.id] || [];
        const assignmentCosts = costs[a.id] || [];
        return (
          <Card key={a.id}>
            <CardContent className="pt-4">
              {/* Compact header */}
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isExpanded ? null : a.id)}>
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{a.building?.name || "Gebäude"}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.building?.address}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {a.unit_number && <Badge variant="secondary" className="text-xs">Einheit {a.unit_number}</Badge>}
                    {a.role_in_building && <Badge variant="outline" className="text-xs">{ROLES.find(r => r.value === a.role_in_building)?.label}</Badge>}
                    {assignmentShares.find(s => s.share_type === 'mea') && (
                      <Badge variant="secondary" className="text-xs">
                        MEA: {assignmentShares.find(s => s.share_type === 'mea')?.share_value}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteAssignment(a.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-border space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Einheit Nr.</Label>
                      <Input value={a.unit_number || ""} onChange={(e) => updateAssignment(a.id, "unit_number", e.target.value)} />
                    </div>
                    <div>
                      <Label>Etage / Lage</Label>
                      <Input value={a.floor_location || ""} onChange={(e) => updateAssignment(a.id, "floor_location", e.target.value)} />
                    </div>
                    <div>
                      <Label>Rolle</Label>
                      <Select value={a.role_in_building || ""} onValueChange={(v) => updateAssignment(a.id, "role_in_building", v)}>
                        <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label>Nutzungsart</Label>
                      <Select value={a.usage_type || ""} onValueChange={(v) => updateAssignment(a.id, "usage_type", v)}>
                        <SelectTrigger><SelectValue placeholder="Wählen" /></SelectTrigger>
                        <SelectContent>
                          {USAGE_TYPES.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Nutzung seit</Label>
                      <Input type="date" value={a.usage_since || ""} onChange={(e) => updateAssignment(a.id, "usage_since", e.target.value)} />
                    </div>
                    <div>
                      <Label>Bankverbindung (Override)</Label>
                      <Select value={a.bank_account_id || "none"} onValueChange={(v) => updateAssignment(a.id, "bank_account_id", v === "none" ? null : v)}>
                        <SelectTrigger><SelectValue placeholder="Standard" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Standard</SelectItem>
                          {bankAccounts.map(b => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.account_holder || "Konto"} — {b.iban?.slice(0, 8)}...
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Shares / Anteile */}
                  <div className="border-t border-border pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-semibold">Anteile / Verteilerschlüssel</Label>
                      <Button size="sm" variant="outline" onClick={() => addShare(a.id)}>
                        <Plus className="h-3 w-3 mr-1" /> Anteil
                      </Button>
                    </div>
                    {assignmentShares.length === 0 && <p className="text-xs text-muted-foreground">Keine Anteile definiert</p>}
                    {assignmentShares.map(s => (
                      <div key={s.id} className="flex items-center gap-2 mt-2">
                        <Select value={s.share_type} onValueChange={(v) => updateShare(s.id, "share_type", v)}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SHARE_TYPES.map(st => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          value={s.share_value}
                          onChange={(e) => updateShare(s.id, "share_value", parseFloat(e.target.value) || 0)}
                          className="w-32"
                        />
                        <Button size="icon" variant="ghost" onClick={() => deleteShare(s.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div>
                    <Label>Notizen</Label>
                    <Textarea value={a.notes || ""} onChange={(e) => updateAssignment(a.id, "notes", e.target.value)} rows={2} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
