import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpsertRgiProject, type RgiProject, type RgiClient } from "@/hooks/useRgi";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: RgiProject | null;
  clients: RgiClient[];
}

export function ProjectDialog({ open, onOpenChange, project, clients }: Props) {
  const upsert = useUpsertRgiProject();
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (open) setForm(project ?? { name: "", sparte: "weg", status: "active" });
  }, [open, project]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.client_id) return;
    await upsert.mutateAsync(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{project ? "Projekt bearbeiten" : "Neues Projekt"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></div>
          <div>
            <Label>Kunde *</Label>
            <Select value={form.client_id ?? ""} onValueChange={(v) => set("client_id", v)}>
              <SelectTrigger><SelectValue placeholder="Kunde wählen…" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sparte</Label>
              <Select value={form.sparte} onValueChange={(v) => set("sparte", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weg">WEG</SelectItem>
                  <SelectItem value="rent">Mietverwaltung</SelectItem>
                  <SelectItem value="sales">Verkauf</SelectItem>
                  <SelectItem value="letting">Vermietung</SelectItem>
                  <SelectItem value="other">Sonstige</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="paused">Pausiert</SelectItem>
                  <SelectItem value="closed">Geschlossen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Std-Stundensatz (€)</Label>
            <Input type="number" step="0.01" value={form.default_hourly_rate ?? ""}
              onChange={(e) => set("default_hourly_rate", e.target.value === "" ? null : Number(e.target.value))} />
          </div>
          <div><Label>Notizen</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!form.name || !form.client_id || upsert.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
