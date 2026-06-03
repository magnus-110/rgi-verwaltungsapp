import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateRgiInvoice, useUpsertRgiInvoiceItems, type RgiTimeEntry, type RgiProject, type RgiClient } from "@/hooks/useRgi";
import { useAuth } from "@/hooks/useAuth";
import { InvoiceEditorDialog } from "./InvoiceEditorDialog";
import { buildRgiItemsFromTime, type RgiGrouping } from "@/lib/rgiBuildItems";

type Grouping = RgiGrouping;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entries: RgiTimeEntry[];
  projects: RgiProject[];
  clients: RgiClient[];
}

export function CreateInvoiceFromTimeDialog({ open, onOpenChange, entries, projects, clients }: Props) {
  const { user } = useAuth();
  const create = useCreateRgiInvoice();
  const upsertItems = useUpsertRgiInvoiceItems();
  const [grouping, setGrouping] = useState<Grouping>("per_day");
  const [clientId, setClientId] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    if (open && entries.length > 0) {
      const projectIds = [...new Set(entries.map((e) => e.project_id))];
      if (projectIds.length === 1) {
        const proj = projects.find((p) => p.id === projectIds[0]);
        if (proj) setClientId(proj.client_id);
      }
    }
  }, [open, entries, projects]);

  const proceed = async () => {
    if (!clientId) return;
    const items = buildRgiItemsFromTime(entries, projects, clients, clientId, grouping);
    const inv = await create.mutateAsync({
      client_id: clientId,
      status: "draft",
      created_by: user?.id,
    } as any);
    await upsertItems.mutateAsync({ invoiceId: inv.id, items });
    setCreatedId(inv.id);
    onOpenChange(false);
    setEditorOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechnung aus {entries.length} Stunden-Einträgen</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Kunde</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Kunde wählen…" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gruppierung</Label>
              <RadioGroup value={grouping} onValueChange={(v) => setGrouping(v as Grouping)} className="mt-2 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="per_entry" /> Pro Eintrag (eine Position je Eintrag)</label>
                <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="per_day" /> Pro Tag (Einträge eines Tags zusammenfassen)</label>
                <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="sum" /> Summe (alle Einträge in einer Position)</label>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={proceed} disabled={!clientId}>Rechnungs-Entwurf erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <InvoiceEditorDialog open={editorOpen} onOpenChange={setEditorOpen} invoiceId={createdId} />
    </>
  );
}

