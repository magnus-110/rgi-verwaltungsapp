import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpsertRgiTimeEntry, type RgiTimeEntry, type RgiProject } from "@/hooks/useRgi";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry?: RgiTimeEntry | null;
  projects: RgiProject[];
}

function parseDuration(input: string): number {
  if (!input) return 0;
  if (input.includes(":")) {
    const [h, m] = input.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  return Number(input) || 0;
}

function formatDuration(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function TimeEntryDialog({ open, onOpenChange, entry, projects }: Props) {
  const upsert = useUpsertRgiTimeEntry();
  const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const [durationStr, setDurationStr] = useState("0:30");

  useEffect(() => {
    if (open) {
      const init = entry ?? {
        date: null,
        minutes: 30,
        billable: true,
        description: "",
      };
      setForm(init);
      setDurationStr(formatDuration(init.minutes ?? 30));
    }
  }, [open, entry]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.project_id || !form.description || !user) return;
    const minutes = parseDuration(durationStr);
    if (minutes <= 0) return;
    await upsert.mutateAsync({
      ...form,
      date: form.date || null,
      minutes,
      user_id: form.user_id ?? user.id,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{entry ? "Stunden bearbeiten" : "Stunden erfassen"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Datum <span className="text-xs text-muted-foreground">(optional)</span></Label><Input type="date" value={form.date ?? ""} onChange={(e) => set("date", e.target.value || null)} /></div>
            <div><Label>Dauer (HH:MM oder Minuten)</Label><Input value={durationStr} onChange={(e) => setDurationStr(e.target.value)} placeholder="1:30" /></div>
          </div>
          <div>
            <Label>Projekt *</Label>
            <Select value={form.project_id ?? ""} onValueChange={(v) => set("project_id", v)}>
              <SelectTrigger><SelectValue placeholder="Projekt wählen…" /></SelectTrigger>
              <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Beschreibung *</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Was wurde gemacht?" /></div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div><Label>Stundensatz-Override (€/h)</Label>
              <Input type="number" step="0.01" value={form.hourly_rate ?? ""}
                onChange={(e) => set("hourly_rate", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
            <label className="flex items-center gap-2 pb-2">
              <Switch checked={form.billable ?? true} onCheckedChange={(v) => set("billable", v)} />
              <span className="text-sm">abrechenbar</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!form.project_id || !form.description || upsert.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
