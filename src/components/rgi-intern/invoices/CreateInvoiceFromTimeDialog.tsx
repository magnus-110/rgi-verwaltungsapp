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
    const items = buildItems(entries, projects, clients, clientId, grouping);
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

function getRate(entry: RgiTimeEntry, projects: RgiProject[], clients: RgiClient[], clientId: string): number {
  if (entry.hourly_rate != null) return Number(entry.hourly_rate);
  const proj = projects.find((p) => p.id === entry.project_id);
  if (proj?.default_hourly_rate != null) return Number(proj.default_hourly_rate);
  const c = clients.find((x) => x.id === clientId);
  if (c?.default_hourly_rate != null) return Number(c.default_hourly_rate);
  return 0;
}

function buildItems(entries: RgiTimeEntry[], projects: RgiProject[], clients: RgiClient[], clientId: string, grouping: Grouping): Partial<RgiInvoiceItem>[] {
  if (grouping === "per_entry") {
    return entries.map((e) => ({
      kind: "time", description: `${e.date} — ${e.description}`,
      quantity: Number((e.minutes / 60).toFixed(2)),
      unit: "Std", unit_price_net: getRate(e, projects, clients, clientId), vat_rate: 19,
      source_time_entry_ids: [e.id],
    }));
  }
  if (grouping === "per_day") {
    const groups = new Map<string, RgiTimeEntry[]>();
    for (const e of entries) {
      const key = `${e.date}|${getRate(e, projects, clients, clientId)}`;
      const arr = groups.get(key) ?? [];
      arr.push(e); groups.set(key, arr);
    }
    return [...groups.entries()].map(([key, es]) => {
      const [date] = key.split("|");
      const totalMin = es.reduce((s, e) => s + e.minutes, 0);
      const descs = es.map((e) => e.description).join("; ");
      return {
        kind: "time", description: `${date} — ${descs}`,
        quantity: Number((totalMin / 60).toFixed(2)),
        unit: "Std", unit_price_net: getRate(es[0], projects, clients, clientId), vat_rate: 19,
        source_time_entry_ids: es.map((e) => e.id),
      };
    });
  }
  // sum
  const totalMin = entries.reduce((s, e) => s + e.minutes, 0);
  // weighted avg rate by minutes
  const totalCost = entries.reduce((s, e) => s + (e.minutes / 60) * getRate(e, projects, clients, clientId), 0);
  const totalHours = totalMin / 60;
  const rate = totalHours > 0 ? totalCost / totalHours : 0;
  const dates = [...new Set(entries.map((e) => e.date))].sort();
  const range = dates.length > 1 ? `${dates[0]} – ${dates[dates.length - 1]}` : dates[0];
  return [{
    kind: "time", description: `Geleistete Stunden ${range}`,
    quantity: Number(totalHours.toFixed(2)),
    unit: "Std", unit_price_net: Number(rate.toFixed(2)), vat_rate: 19,
    source_time_entry_ids: entries.map((e) => e.id),
  }];
}
