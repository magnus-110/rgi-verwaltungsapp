import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { useManagementMode } from "@/hooks/useManagementMode";

interface CreateAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAuditDialog({ open, onOpenChange }: CreateAuditDialogProps) {
  const queryClient = useQueryClient();
  const { managementMode } = useManagementMode();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [portalUntil, setPortalUntil] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["buildings-audit", managementMode],
    queryFn: async () => {
      const { data } = await supabase
        .from("buildings")
        .select("id, name, address")
        .eq("management_mode", managementMode || "weg")
        .order("name");
      return data || [];
    },
  });

  const { data: periods = [] } = useQuery({
    queryKey: ["billing-periods-audit", selectedBuildingId],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      const { data } = await supabase
        .from("billing_periods")
        .select("id, fiscal_year, period_from, period_to")
        .eq("building_id", selectedBuildingId)
        .order("fiscal_year", { ascending: false });
      return data || [];
    },
    enabled: !!selectedBuildingId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-audit", selectedBuildingId],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      const { data } = await supabase
        .from("contact_building_assignments")
        .select(`
          contact_id,
          role_in_building,
          contacts!inner(id, company_name, contact_persons(first_name, last_name, is_primary))
        `)
        .eq("building_id", selectedBuildingId)
        .eq("role_in_building", "eigentuemer");
      return (data || []).map((d: any) => ({
        id: d.contacts.id,
        name: d.contacts.contact_persons?.filter((p: any) => p.is_primary)?.[0]
          ? `${d.contacts.contact_persons.filter((p: any) => p.is_primary)[0].first_name} ${d.contacts.contact_persons.filter((p: any) => p.is_primary)[0].last_name}`
          : d.contacts.company_name || "Unbekannt",
      }));
    },
    enabled: !!selectedBuildingId,
  });

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  // Auto-Default: Vorjahr für Kassenprüfung
  useEffect(() => {
    if (!periods.length || selectedPeriodId) return;
    const previousYear = new Date().getFullYear() - 1;
    const match =
      periods.find((p: any) => p.fiscal_year === previousYear) ??
      periods.find((p: any) => p.fiscal_year < new Date().getFullYear()) ??
      periods[0];
    if (match) setSelectedPeriodId(match.id);
  }, [periods, selectedPeriodId]);

  const handleCreate = async () => {
    if (!selectedBuildingId || !selectedPeriodId || !selectedContactId) {
      toast.error("Bitte alle Felder ausfüllen");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("cash_audits").insert({
        building_id: selectedBuildingId,
        billing_period_id: selectedPeriodId,
        fiscal_year: selectedPeriod?.fiscal_year || new Date().getFullYear(),
        auditor_contact_id: selectedContactId,
        visible_in_portal_until: portalUntil ? new Date(portalUntil).toISOString() : null,
      });
      if (error) throw error;
      toast.success("Kassenprüfung erstellt");
      queryClient.invalidateQueries({ queryKey: ["cash-audits"] });
      onOpenChange(false);
      setSelectedBuildingId("");
      setSelectedPeriodId("");
      setSelectedContactId("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kassenprüfung erstellen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Liegenschaft</Label>
            <Select value={selectedBuildingId} onValueChange={(v) => { setSelectedBuildingId(v); setSelectedPeriodId(""); setSelectedContactId(""); }}>
              <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
              <SelectContent>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Abrechnungsjahr</Label>
            <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId} disabled={!selectedBuildingId}>
              <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.fiscal_year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Kassenprüfer (Eigentümer)</Label>
            <Select value={selectedContactId} onValueChange={setSelectedContactId} disabled={!selectedBuildingId}>
              <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Sichtbar im Portal bis</Label>
            <Input type="date" value={portalUntil} onChange={(e) => setPortalUntil(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? "Erstelle..." : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
