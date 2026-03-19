import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, User, ChevronDown, ChevronUp, Phone, Mail, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AssignContactDialog } from "./AssignContactDialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const COST_TYPES = ["Hausgeld", "Rücklage", "Sonderumlage", "Heizkosten", "Nebenkosten", "Miete", "Stellplatz", "Garage"];
const INTERVALS = [
  { value: "monatlich", label: "Monatlich" },
  { value: "quartal", label: "Quartalsweise" },
  { value: "jaehrlich", label: "Jährlich" },
];

interface ContactAssignment {
  id: string;
  contact_id: string;
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
  contact: {
    id: string;
    salutation: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    address_street: string | null;
    address_zip: string | null;
    address_city: string | null;
  };
  shares: { id: string; share_type: string; share_value: number }[];
  phones: { phone_number: string; label: string }[];
  emails: { email: string; label: string }[];
  costs: { id: string; cost_type: string; amount: number; interval: string }[];
}

interface Props {
  buildingId: string;
}

export function BuildingContactsList({ buildingId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContactAssignment | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: assignments = [], refetch } = useQuery({
    queryKey: ['building-contact-assignments', buildingId],
    queryFn: async () => {
      const { data: assignData, error } = await supabase
        .from("contact_building_assignments")
        .select("*, contact:contacts(id, salutation, first_name, last_name, company_name, address_street, address_zip, address_city)")
        .eq("building_id", buildingId)
        .eq("is_active", true)
        .order("created_at");
      
      if (error || !assignData) return [];

      const assignmentIds = assignData.map(a => a.id);
      const contactIds = assignData.map(a => a.contact_id);

      const [sharesRes, phonesRes, emailsRes, costsRes] = await Promise.all([
        assignmentIds.length > 0 
          ? supabase.from("contact_building_shares").select("*").in("assignment_id", assignmentIds)
          : { data: [] },
        contactIds.length > 0
          ? supabase.from("contact_phones").select("*").in("contact_id", contactIds)
          : { data: [] },
        contactIds.length > 0
          ? supabase.from("contact_emails").select("*").in("contact_id", contactIds)
          : { data: [] },
        assignmentIds.length > 0
          ? supabase.from("contact_building_costs").select("*").in("assignment_id", assignmentIds)
          : { data: [] },
      ]);

      return assignData.map(a => ({
        ...a,
        shares: (sharesRes.data || []).filter((s: any) => s.assignment_id === a.id),
        phones: (phonesRes.data || []).filter((p: any) => p.contact_id === a.contact_id),
        emails: (emailsRes.data || []).filter((e: any) => e.contact_id === a.contact_id),
        costs: (costsRes.data || []).filter((c: any) => c.assignment_id === a.id),
      })) as ContactAssignment[];
    },
  });

  const getDisplayName = (a: ContactAssignment) => {
    const c = a.contact;
    if (c.company_name) return c.company_name;
    return [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ") || "Unbenannt";
  };

  const getMea = (a: ContactAssignment) => {
    const mea = a.shares.find(s => s.share_type === 'mea');
    return mea ? mea.share_value : null;
  };

  const getHausgeld = (a: ContactAssignment) => {
    const hg = a.costs.find(c => c.cost_type.toLowerCase().includes('hausgeld'));
    return hg ? hg.amount : null;
  };

  const updateAssignment = async (id: string, field: string, value: any) => {
    await supabase.from("contact_building_assignments").update({ [field]: value || null }).eq("id", id);
    refetch();
  };

  const removeAssignment = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("contact_building_assignments").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Zuordnung entfernt" });
      setDeleteTarget(null);
      setExpanded(null);
      refetch();
    }
  };

  // Shares
  const addShare = async (assignmentId: string) => {
    await supabase.from("contact_building_shares").insert({ assignment_id: assignmentId, share_type: "mea", share_value: 0 });
    refetch();
  };
  const updateShare = async (id: string, field: string, value: any) => {
    await supabase.from("contact_building_shares").update({ [field]: value }).eq("id", id);
    refetch();
  };
  const deleteShare = async (id: string) => {
    await supabase.from("contact_building_shares").delete().eq("id", id);
    refetch();
  };

  // Costs
  const addCost = async (assignmentId: string) => {
    await supabase.from("contact_building_costs").insert({ assignment_id: assignmentId, cost_type: "Hausgeld", amount: 0, interval: "monatlich" });
    refetch();
  };
  const updateCost = async (id: string, field: string, value: any) => {
    await supabase.from("contact_building_costs").update({ [field]: value }).eq("id", id);
    refetch();
  };
  const deleteCost = async (id: string) => {
    await supabase.from("contact_building_costs").delete().eq("id", id);
    refetch();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Kontakte ({assignments.length})</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}>
          <Plus className="h-3 w-3 mr-1" /> Kontakt zuordnen
        </Button>
      </div>

      {assignments.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">Keine Kontakte zugeordnet</p>
      )}

      {assignments.map((a) => {
        const isExpanded = expanded === a.id;
        const mea = getMea(a);
        const hausgeld = getHausgeld(a);

        return (
          <Card key={a.id} className="overflow-hidden">
            <CardContent className="p-0">
              {/* Compact row */}
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : a.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{getDisplayName(a)}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
                    {a.unit_number && <Badge variant="secondary" className="text-xs">Einheit {a.unit_number}</Badge>}
                    {a.role_in_building && <Badge variant="outline" className="text-xs">{ROLES.find(r => r.value === a.role_in_building)?.label || a.role_in_building}</Badge>}
                    {mea !== null && <Badge variant="secondary" className="text-xs">MEA: {mea}</Badge>}
                    {hausgeld !== null && <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{hausgeld.toFixed(2)} €</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-border space-y-4">
                  {/* Contact info (read-only) */}
                  <div className="flex flex-wrap gap-3 text-sm">
                    {a.phones.map((p, i) => (
                      <span key={i} className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="h-3 w-3" /> {p.phone_number}
                      </span>
                    ))}
                    {a.emails.map((e, i) => (
                      <span key={i} className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="h-3 w-3" /> {e.email}
                      </span>
                    ))}
                  </div>

                  {/* Address */}
                  {(a.contact.address_street || a.contact.address_zip || a.contact.address_city) && (
                    <div className="text-sm text-muted-foreground">
                      {a.contact.address_street && <span>{a.contact.address_street}, </span>}
                      {a.contact.address_zip && <span>{a.contact.address_zip} </span>}
                      {a.contact.address_city && <span>{a.contact.address_city}</span>}
                    </div>
                  )}

                  {/* Assignment fields */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Einheit Nr.</Label>
                      <Input
                        value={a.unit_number || ""}
                        onChange={(e) => updateAssignment(a.id, "unit_number", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Etage / Lage</Label>
                      <Input
                        value={a.floor_location || ""}
                        onChange={(e) => updateAssignment(a.id, "floor_location", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Rolle</Label>
                      <Select value={a.role_in_building || ""} onValueChange={(v) => updateAssignment(a.id, "role_in_building", v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wählen" /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Nutzungsart</Label>
                      <Select value={a.usage_type || ""} onValueChange={(v) => updateAssignment(a.id, "usage_type", v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wählen" /></SelectTrigger>
                        <SelectContent>
                          {USAGE_TYPES.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Nutzung seit</Label>
                      <Input
                        type="date"
                        value={a.usage_since || ""}
                        onChange={(e) => updateAssignment(a.id, "usage_since", e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>

                  {/* Shares / Anteile */}
                  <div className="border-t border-border pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-semibold">Anteile / Verteilerschlüssel</Label>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addShare(a.id)}>
                        <Plus className="h-3 w-3 mr-1" /> Anteil
                      </Button>
                    </div>
                    {a.shares.length === 0 && <p className="text-xs text-muted-foreground">Keine Anteile definiert</p>}
                    {a.shares.map(s => (
                      <div key={s.id} className="flex items-center gap-2 mt-2">
                        <Select value={s.share_type} onValueChange={(v) => updateShare(s.id, "share_type", v)}>
                          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SHARE_TYPES.map(st => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          value={s.share_value}
                          onChange={(e) => updateShare(s.id, "share_value", parseFloat(e.target.value) || 0)}
                          className="w-28 h-8 text-sm"
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteShare(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Kosten */}
                  <div className="border-t border-border pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-semibold">Kosten</Label>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => addCost(a.id)}>
                        <Plus className="h-3 w-3 mr-1" /> Kosten
                      </Button>
                    </div>
                    {a.costs.length === 0 && <p className="text-xs text-muted-foreground">Keine Kosten definiert</p>}
                    {a.costs.map(c => (
                      <div key={c.id} className="flex items-center gap-2 mt-2">
                        <Select value={c.cost_type} onValueChange={(v) => updateCost(c.id, "cost_type", v)}>
                          <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {COST_TYPES.map(ct => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          value={c.amount}
                          onChange={(e) => updateCost(c.id, "amount", parseFloat(e.target.value) || 0)}
                          className="w-24 h-8 text-sm"
                          placeholder="Betrag"
                        />
                        <span className="text-xs text-muted-foreground">€</span>
                        <Select value={c.interval} onValueChange={(v) => updateCost(c.id, "interval", v)}>
                          <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {INTERVALS.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteCost(c.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Notizen */}
                  <div>
                    <Label className="text-xs">Notizen</Label>
                    <Textarea
                      value={a.notes || ""}
                      onChange={(e) => updateAssignment(a.id, "notes", e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zuordnung entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `${getDisplayName(deleteTarget)} wird von diesem Gebäude entfernt. Der Kontakt selbst bleibt erhalten.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={removeAssignment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignContactDialog
        open={showAssign}
        onOpenChange={setShowAssign}
        buildingId={buildingId}
        onAssigned={refetch}
        existingContactIds={assignments.map(a => a.contact_id)}
      />
    </div>
  );
}
