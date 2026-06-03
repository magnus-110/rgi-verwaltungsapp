import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useRgiClients, useRgiProjects, type RgiInvoiceItem, type RgiTimeEntry } from "@/hooks/useRgi";
import { buildRgiItemsFromTime, type RgiGrouping } from "@/lib/rgiBuildItems";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  clientId: string;
  onApply: (items: Partial<RgiInvoiceItem>[]) => void;
}

export function ImportFromProjectDialog({ open, onOpenChange, projectId, clientId, onApply }: Props) {
  const { data: projects } = useRgiProjects();
  const { data: clients } = useRgiClients();
  const [grouping, setGrouping] = useState<RgiGrouping>("per_day");
  const [selectedTime, setSelectedTime] = useState<Set<string>>(new Set());
  const [selectedPrev, setSelectedPrev] = useState<Set<number>>(new Set());

  const { data: openEntries } = useQuery({
    queryKey: ["rgi", "import-time", projectId],
    enabled: open && !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rgi_time_entries").select("*")
        .eq("project_id", projectId).is("invoice_item_id", null).eq("billable", true)
        .order("date", { ascending: true });
      if (error) throw error;
      return data as RgiTimeEntry[];
    },
  });

  const { data: prevItems } = useQuery({
    queryKey: ["rgi", "import-prev", projectId],
    enabled: open && !!projectId,
    queryFn: async () => {
      const { data: invs, error } = await supabase
        .from("rgi_invoices").select("id, issue_date, invoice_number")
        .eq("project_id", projectId).order("issue_date", { ascending: false }).limit(1);
      if (error) throw error;
      if (!invs || invs.length === 0) return { items: [] as any[], inv: null as null | { issue_date: string; invoice_number: string | null } };
      const { data: items, error: e2 } = await supabase
        .from("rgi_invoice_items").select("*").eq("invoice_id", invs[0].id).order("position");
      if (e2) throw e2;
      return { items: items ?? [], inv: invs[0] as any };
    },
  });

  useEffect(() => {
    if (open) {
      setSelectedTime(new Set((openEntries ?? []).map((e) => e.id)));
      setSelectedPrev(new Set());
    }
  }, [open, openEntries]);

  const toggleTime = (id: string) => {
    const s = new Set(selectedTime);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedTime(s);
  };
  const togglePrev = (idx: number) => {
    const s = new Set(selectedPrev);
    s.has(idx) ? s.delete(idx) : s.add(idx);
    setSelectedPrev(s);
  };

  const selectedTimeEntries = useMemo(
    () => (openEntries ?? []).filter((e) => selectedTime.has(e.id)),
    [openEntries, selectedTime],
  );

  const apply = () => {
    const out: Partial<RgiInvoiceItem>[] = [];
    if (selectedTimeEntries.length > 0) {
      out.push(...buildRgiItemsFromTime(selectedTimeEntries, projects ?? [], clients ?? [], clientId, grouping));
    }
    const prev = prevItems?.items ?? [];
    selectedPrev.forEach((idx) => {
      const it = prev[idx];
      if (!it) return;
      out.push({
        kind: it.kind, description: it.description, quantity: Number(it.quantity),
        unit: it.unit, unit_price_net: Number(it.unit_price_net), vat_rate: Number(it.vat_rate),
      });
    });
    if (out.length === 0) {
      toast.error("Nichts ausgewählt");
      return;
    }
    onApply(out);
    onOpenChange(false);
    toast.success(`${out.length} Position(en) übernommen`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aus Projekt übernehmen</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Offene Stunden */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Offene Stunden</h3>
              <Badge variant="outline">{(openEntries ?? []).length}</Badge>
            </div>
            {(openEntries ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Keine offenen, abrechenbaren Stunden.</p>
            ) : (
              <>
                <div className="mb-3">
                  <Label className="text-xs">Gruppierung</Label>
                  <RadioGroup value={grouping} onValueChange={(v) => setGrouping(v as RgiGrouping)} className="mt-1 space-y-1">
                    <label className="flex items-center gap-2 cursor-pointer text-sm"><RadioGroupItem value="per_entry" />Pro Eintrag</label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm"><RadioGroupItem value="per_day" />Pro Tag</label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm"><RadioGroupItem value="sum" />Als Summe</label>
                  </RadioGroup>
                </div>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {(openEntries ?? []).map((e) => (
                    <label key={e.id} className="flex items-start gap-2 text-sm p-2 rounded hover:bg-muted cursor-pointer">
                      <Checkbox checked={selectedTime.has(e.id)} onCheckedChange={() => toggleTime(e.id)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{e.date}</span>
                          <span className="font-mono">{(e.minutes / 60).toFixed(2)}h</span>
                        </div>
                        <div className="truncate">{e.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Letzte Rechnung */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Letzte Rechnung</h3>
              {prevItems?.inv && <Badge variant="outline">{prevItems.inv.invoice_number ?? "Entwurf"} · {prevItems.inv.issue_date}</Badge>}
            </div>
            {!prevItems?.inv || prevItems.items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Keine vorherige Rechnung für dieses Projekt.</p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {prevItems.items.map((it: any, idx: number) => (
                  <label key={idx} className="flex items-start gap-2 text-sm p-2 rounded hover:bg-muted cursor-pointer">
                    <Checkbox checked={selectedPrev.has(idx)} onCheckedChange={() => togglePrev(idx)} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{it.description}</div>
                      <div className="text-xs text-muted-foreground">{Number(it.quantity).toFixed(2)} {it.unit} × {Number(it.unit_price_net).toFixed(2)} €</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={apply}>Übernehmen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
