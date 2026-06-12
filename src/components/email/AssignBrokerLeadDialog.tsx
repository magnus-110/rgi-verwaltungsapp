import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailId: string;
}

export const AssignBrokerLeadDialog = ({ open, onOpenChange, emailId }: Props) => {
  const [propertyId, setPropertyId] = useState<string>("");
  const [leadId, setLeadId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: properties = [] } = useQuery({
    queryKey: ["broker-properties-min"],
    queryFn: async () => {
      const { data } = await (supabase.from("broker_properties") as any)
        .select("id, title, listing_type")
        .eq("is_active", true)
        .order("title");
      return data || [];
    },
    enabled: open,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["broker-leads-for-property", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data } = await (supabase.from("broker_leads") as any)
        .select("id, external_name, external_email, status")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  useEffect(() => { setLeadId(""); }, [propertyId]);

  const save = async () => {
    if (!propertyId) { toast.error("Bitte Objekt wählen"); return; }
    setSaving(true);
    const updates: any = { broker_property_id: propertyId };
    if (leadId) updates.broker_lead_id = leadId;
    const { error } = await (supabase.from("emails") as any).update(updates).eq("id", emailId);
    if (error) { toast.error(error.message); setSaving(false); return; }

    if (leadId) {
      await (supabase.from("broker_lead_events") as any).insert({
        lead_id: leadId,
        event_type: "email",
        title: "E-Mail zugeordnet",
        email_id: emailId,
        occurred_at: new Date().toISOString(),
      });
    }
    toast.success("E-Mail dem Interessenten zugeordnet");
    qc.invalidateQueries({ queryKey: ["emails"] });
    qc.invalidateQueries({ queryKey: ["broker-lead-events"] });
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Interessent zuordnen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Makler-Objekt</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue placeholder="Objekt wählen..." /></SelectTrigger>
              <SelectContent>
                {properties.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} ({p.listing_type === "rent" ? "Vermietung" : "Verkauf"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {propertyId && (
            <div>
              <Label>Interessent (optional)</Label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger><SelectValue placeholder="Interessent wählen..." /></SelectTrigger>
                <SelectContent>
                  {leads.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.external_name || l.external_email || "Unbenannt"} — {l.status}
                    </SelectItem>
                  ))}
                  {leads.length === 0 && (
                    <div className="px-2 py-3 text-sm text-muted-foreground">Keine Interessenten</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save} disabled={saving || !propertyId}>Zuordnen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
