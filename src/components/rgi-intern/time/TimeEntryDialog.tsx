import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown } from "lucide-react";
import { useUpsertRgiTimeEntry, type RgiTimeEntry, type RgiProject } from "@/hooks/useRgi";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry?: RgiTimeEntry | null;
  projects: RgiProject[];
}

/** Nimmt „1:30“, „1,5“ oder „90“ und macht daraus Minuten. */
function parseDuration(input: string): number {
  const s = (input ?? "").trim();
  if (!s) return 0;
  if (s.includes(":")) {
    const [h, m] = s.split(":").map((x) => Number(x));
    return (h || 0) * 60 + (m || 0);
  }
  if (s.includes(",") || s.includes(".")) {
    const hours = Number(s.replace(",", "."));
    return isNaN(hours) ? 0 : Math.round(hours * 60);
  }
  return Number(s) || 0;
}

function humanDuration(min: number): string {
  if (min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} Minuten`;
  if (m === 0) return h === 1 ? "1 Stunde" : `${h} Stunden`;
  return `${h} Std. ${m} Min.`;
}

const QUICK = [15, 30, 45, 60, 90, 120];

function quickLabel(m: number): string {
  if (m < 60) return `${m} Min.`;
  if (m === 60) return "1 Std.";
  const h = m / 60;
  return `${String(h).replace(".", ",")} Std.`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const eur = (n: number) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function TimeEntryDialog({ open, onOpenChange, entry, projects }: Props) {
  const upsert = useUpsertRgiTimeEntry();
  const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const [durationStr, setDurationStr] = useState("30");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const init = entry ?? { date: today(), minutes: 30, billable: true, description: "" };
    setForm(init);
    setDurationStr(String(init.minutes ?? 30));
    setMoreOpen(false);
  }, [open, entry]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const minutes = useMemo(() => parseDuration(durationStr), [durationStr]);
  const project = projects.find((p) => p.id === form.project_id);
  const rate = form.hourly_rate ?? project?.default_hourly_rate ?? null;
  const value = rate != null && minutes > 0 ? (Number(rate) * minutes) / 60 : null;

  const canSave = !!form.project_id && !!(form.description ?? "").trim() && minutes > 0 && !!user;

  const submit = async () => {
    if (!canSave) return;
    await upsert.mutateAsync({
      ...form,
      date: form.date || null,
      minutes,
      user_id: form.user_id ?? user!.id,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Stunden bearbeiten" : "Stunden erfassen"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="text-base">Für welches Projekt?</Label>
            <Select value={form.project_id ?? ""} onValueChange={(v) => set("project_id", v)}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Projekt wählen…" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {projects.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Es gibt noch kein Projekt. Lege zuerst eines im Bereich Projekte an.
              </p>
            )}
          </div>

          <div>
            <Label className="text-base">Wie lange?</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {QUICK.map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={minutes === m ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDurationStr(String(m))}
                >
                  {quickLabel(m)}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2.5">
              <Input
                className="w-32"
                value={durationStr}
                onChange={(e) => setDurationStr(e.target.value)}
                placeholder="z. B. 1:45"
              />
              <span className="text-sm text-muted-foreground">
                {minutes > 0 ? `= ${humanDuration(minutes)}` : "Minuten, 1:45 oder 1,75"}
              </span>
            </div>
          </div>

          <div>
            <Label className="text-base">Was wurde gemacht?</Label>
            <Textarea
              className="mt-1.5"
              rows={3}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Steht später so auf der Rechnung, am besten ein Satz, den auch die Eigentümer verstehen."
            />
          </div>

          <div>
            <Label className="text-base">Wann?</Label>
            <Input
              className="mt-1.5"
              type="date"
              value={form.date ?? ""}
              onChange={(e) => set("date", e.target.value || null)}
            />
          </div>

          {value != null && (
            <div className="rounded-md bg-primary/10 border border-primary/20 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Ergibt</div>
              <div className="text-lg font-semibold text-primary tabular-nums">
                {eur(value)} €
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}bei {eur(Number(rate))} € pro Stunde
                </span>
              </div>
            </div>
          )}

          <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
                <ChevronDown className={`w-4 h-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                Weitere Angaben
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              <div>
                <Label>Anderer Stundensatz nur für diesen Eintrag</Label>
                <Input
                  className="mt-1.5"
                  inputMode="decimal"
                  value={form.hourly_rate ?? ""}
                  onChange={(e) =>
                    set("hourly_rate", e.target.value === "" ? null : Number(e.target.value.replace(",", ".")))
                  }
                  placeholder={
                    project?.default_hourly_rate
                      ? `Standard: ${eur(Number(project.default_hourly_rate))} €`
                      : "leer = Satz des Projekts"
                  }
                />
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox
                  className="mt-0.5"
                  checked={form.billable === false}
                  onCheckedChange={(v) => set("billable", !v)}
                />
                <span className="text-sm">
                  Diese Zeit nicht abrechnen
                  <span className="block text-xs text-muted-foreground">
                    Wird erfasst, erscheint aber nicht bei den abrechenbaren Stunden.
                  </span>
                </span>
              </label>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={submit} disabled={!canSave || upsert.isPending}>
            {upsert.isPending ? "Speichern…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
