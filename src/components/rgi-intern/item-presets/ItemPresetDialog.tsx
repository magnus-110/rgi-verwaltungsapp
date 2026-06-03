import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useUpsertRgiItemPreset, type RgiItemPreset, type RgiPresetItem } from "@/hooks/useRgi";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preset?: RgiItemPreset | null;
}

const emptyItem = (): RgiPresetItem => ({
  kind: "flat", description: "", quantity: 1, unit: "Stk", unit_price_net: 0, vat_rate: 19,
});

export function ItemPresetDialog({ open, onOpenChange, preset }: Props) {
  const upsert = useUpsertRgiItemPreset();
  const [name, setName] = useState("");
  const [sparte, setSparte] = useState<string>("none");
  const [items, setItems] = useState<RgiPresetItem[]>([emptyItem()]);

  useEffect(() => {
    if (!open) return;
    if (preset) {
      setName(preset.name);
      setSparte(preset.sparte ?? "none");
      setItems(((preset.items as any) ?? []).map((it: any) => ({
        kind: it.kind ?? "flat",
        description: it.description ?? "",
        quantity: Number(it.quantity ?? 1),
        unit: it.unit ?? "Stk",
        unit_price_net: Number(it.unit_price_net ?? 0),
        vat_rate: Number(it.vat_rate ?? 19),
      })));
    } else {
      setName("");
      setSparte("none");
      setItems([emptyItem()]);
    }
  }, [open, preset]);

  const setItem = (idx: number, patch: Partial<RgiPresetItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const save = async () => {
    if (!name.trim()) return;
    await upsert.mutateAsync({
      id: preset?.id,
      name: name.trim(),
      sparte: sparte === "none" ? null : sparte,
      items,
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{preset ? "Vorlage bearbeiten" : "Neue Rechnungsvorlage"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Verwaltergebühr WEG monatlich" />
            </div>
            <div>
              <Label>Sparte</Label>
              <Select value={sparte} onValueChange={setSparte}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— alle —</SelectItem>
                  <SelectItem value="hausverwaltung">Hausverwaltung</SelectItem>
                  <SelectItem value="immobilien">Immobilien</SelectItem>
                  <SelectItem value="sonstiges">Sonstiges</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Positionen</Label>
              <Button size="sm" variant="outline" onClick={() => setItems([...items, emptyItem()])}>
                <Plus className="w-4 h-4 mr-1" />Position
              </Button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_70px_70px_90px_70px_30px] gap-2 text-xs text-muted-foreground px-1">
                <span>Beschreibung</span><span>Menge</span><span>Einheit</span><span>€ netto</span><span>USt%</span><span /></div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_70px_70px_90px_70px_30px] gap-2 items-center">
                  <Textarea rows={1} className="min-h-9" value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} />
                  <Input type="number" step="0.01" value={it.quantity} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                  <Input value={it.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} />
                  <Input type="number" step="0.01" value={it.unit_price_net} onChange={(e) => setItem(idx, { unit_price_net: Number(e.target.value) })} />
                  <Select value={String(it.vat_rate)} onValueChange={(v) => setItem(idx, { vat_rate: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="7">7%</SelectItem>
                      <SelectItem value="19">19%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {items.length === 0 && <div className="text-sm text-muted-foreground text-center py-3">Noch keine Positionen.</div>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={save} disabled={!name.trim() || upsert.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
