// Ein Projekt mit seinen Stunden.
//
// Das Erfassen steht oben und ist immer offen — kein Knopf, der erst
// einen Dialog aufgehen lässt, und keine Projektauswahl mehr: das
// Projekt ist ja schon offen. Bearbeiten benutzt dieselbe Zeile, statt
// ein zweites Formular über das erste zu legen.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Clock, Plus, Pencil, Trash2, FileText, X, CalendarClock, Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  useRgiTimeEntries, useUpsertRgiTimeEntry, useDeleteRgiTimeEntry,
  useRgiProjects, useRgiClients,
  type RgiProject, type RgiTimeEntry,
} from "@/hooks/useRgi";
import { useAuth } from "@/hooks/useAuth";
import { CreateInvoiceFromTimeDialog } from "../invoices/CreateInvoiceFromTimeDialog";
import {
  parseDuration, shortDuration, longDuration, formatHours, formatEuro, formatDay,
  todayIso, valueOf, isOpen, totalsFor, groupByMonth,
} from "@/lib/rgiTime";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: RgiProject | null;
  clientName: string;
  onEdit: () => void;
}

const QUICK = [15, 30, 45, 60, 90, 120];

const STATUS_LABEL: Record<string, string> = {
  active: "läuft", paused: "pausiert", closed: "abgeschlossen",
};

const SPARTE_LABEL: Record<string, string> = {
  weg: "WEG", rent: "Miete", sales: "Verkauf", letting: "Vermietung", other: "Sonstige",
};

export function ProjectSheet({ open, onOpenChange, project, clientName, onEdit }: Props) {
  const { user } = useAuth();
  const { data: entries, isLoading } = useRgiTimeEntries(
    project ? { projectId: project.id } : undefined,
  );
  const { data: projects } = useRgiProjects();
  const { data: clients } = useRgiClients();
  const upsert = useUpsertRgiTimeEntry();
  const del = useDeleteRgiTimeEntry();

  // Erfassungszeile
  const [date, setDate] = useState(todayIso());
  const [dur, setDur] = useState("30");
  const [desc, setDesc] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [ownRate, setOwnRate] = useState<string>("");
  const [notBillable, setNotBillable] = useState(false);
  const [toDelete, setToDelete] = useState<RgiTimeEntry | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const resetCapture = () => {
    setEditId(null);
    setDate(todayIso());
    setDur("30");
    setDesc("");
    setOwnRate("");
    setNotBillable(false);
  };

  useEffect(() => { if (open) resetCapture(); }, [open, project?.id]);

  const list = entries ?? [];
  const totals = useMemo(() => totalsFor(list, project), [list, project]);
  const groups = useMemo(() => groupByMonth(list), [list]);
  const openEntries = useMemo(() => list.filter(isOpen), [list]);

  const minutes = parseDuration(dur);
  const previewRate = ownRate.trim()
    ? Number(ownRate.replace(",", "."))
    : Number(project?.default_hourly_rate ?? 0);
  const previewValue = minutes > 0 ? (previewRate * minutes) / 60 : 0;

  if (!project) return null;

  const save = async () => {
    if (!user) { toast.error("Nicht angemeldet"); return; }
    if (minutes <= 0) { toast.error("Wie lange? Bitte eine Dauer angeben."); return; }
    if (!desc.trim()) { toast.error("Bitte kurz beschreiben, was gemacht wurde."); return; }
    const rate = ownRate.trim() ? Number(ownRate.replace(",", ".")) : null;
    await upsert.mutateAsync({
      ...(editId ? { id: editId } : {}),
      project_id: project.id,
      user_id: user.id,
      date: date || null,
      minutes,
      description: desc.trim(),
      billable: !notBillable,
      hourly_rate: rate,
    } as any);
    resetCapture();
    descRef.current?.focus();
  };

  const startEdit = (e: RgiTimeEntry) => {
    setEditId(e.id);
    setDate(e.date ?? "");
    setDur(String(e.minutes));
    setDesc(e.description ?? "");
    setOwnRate(e.hourly_rate != null ? String(e.hourly_rate) : "");
    setNotBillable(!e.billable);
    descRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3 text-left pr-8">
            <span className="min-w-0 flex-1">
              <span className="block text-lg">{project.name}</span>
              <span className="block text-xs font-normal text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${project.status === "active" ? "bg-emerald-600" : "bg-muted-foreground"}`} />
                  {STATUS_LABEL[project.status] ?? project.status}
                </Badge>
                <span>{clientName}</span>
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                  {SPARTE_LABEL[project.sparte] ?? project.sparte}
                </Badge>
                {project.default_hourly_rate != null && (
                  <span className="tabular-nums">{formatEuro(Number(project.default_hourly_rate))} / Std</span>
                )}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" />Bearbeiten
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={openEntries.length === 0}
            onClick={() => setInvoiceOpen(true)}
          >
            <FileText className="w-3.5 h-3.5" />
            Abrechnen{openEntries.length > 0 ? ` (${formatHours(totals.openMinutes)} Std)` : ""}
          </Button>
        </div>

        {/* Stand */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <SmallTile
            accent
            label="Offen"
            value={formatHours(totals.openMinutes)}
            unit="Std"
            foot={`${formatEuro(totals.openValue)} abrechenbar`}
          />
          <SmallTile
            label="Abgerechnet"
            value={formatHours(totals.billedMinutes)}
            unit="Std"
            foot={totals.billedMinutes > 0 ? "bereits berechnet" : "noch nichts berechnet"}
          />
          <SmallTile
            label="Stundensatz"
            value={Number(project.default_hourly_rate ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })}
            unit="€"
            foot="gilt für alle Stunden hier"
          />
        </div>

        {/* Erfassen — immer offen */}
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-3">
            {editId ? <Pencil className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            {editId ? "Eintrag ändern" : "Stunden erfassen"}
            {editId && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={resetCapture}>
                <X className="w-3.5 h-3.5" />Abbrechen
              </Button>
            )}
          </div>

          <div className="grid sm:grid-cols-[150px_1fr] gap-3">
            <div>
              <Label className="text-xs">Wann</Label>
              <Input type="date" className="mt-1 bg-background" value={date}
                onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Was wurde gemacht</Label>
              <Textarea
                ref={descRef}
                rows={1}
                className="mt-1 min-h-[38px] bg-background"
                placeholder="Steht später so auf der Rechnung — ein Satz, den auch die Eigentümer verstehen."
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
                }}
              />
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap mt-3">
            {QUICK.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={minutes === m ? "default" : "outline"}
                className={`h-7 px-2.5 text-xs tabular-nums ${minutes === m ? "" : "bg-background"}`}
                onClick={() => setDur(String(m))}
              >
                {shortDuration(m)}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap mt-3">
            <Input
              className="w-[110px] bg-background tabular-nums"
              value={dur}
              onChange={(e) => setDur(e.target.value)}
              placeholder="z. B. 1:45"
            />
            <span className="text-sm text-primary font-medium tabular-nums">
              {minutes > 0 ? (
                <>
                  = {longDuration(minutes)}
                  {previewRate > 0 && (
                    <span className="text-muted-foreground font-normal"> · {formatEuro(previewValue)}</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground font-normal">Minuten, 1:45 oder 1,75</span>
              )}
            </span>
            <div className="flex-1" />
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none"
              title="Wird erfasst, taucht aber nicht bei den abrechenbaren Stunden auf.">
              <Checkbox checked={notBillable} onCheckedChange={(v) => setNotBillable(!!v)} />
              nicht abrechnen
            </label>
            <Input
              className="w-[160px] bg-background tabular-nums"
              value={ownRate}
              onChange={(e) => setOwnRate(e.target.value)}
              placeholder="anderer Satz (€)"
            />
            <Button className="gap-1.5" disabled={upsert.isPending} onClick={save}>
              {editId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editId ? "Änderung speichern" : "Eintragen"}
            </Button>
          </div>
        </div>

        {/* Erfasste Stunden */}
        <div className="rounded-lg border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/40">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Erfasste Stunden
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {totals.entries === 1 ? "1 Eintrag" : `${totals.entries} Einträge`}
            </span>
          </div>

          {isLoading ? (
            <Skeleton className="h-40 m-4" />
          ) : list.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Clock className="w-9 h-9 mx-auto mb-3 opacity-25" />
              Noch keine Stunden. Trag oben den ersten Eintrag ein.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                <div className="flex items-center px-4 py-1.5 bg-muted/30 border-t text-xs font-medium">
                  <span className={g.undated ? "text-primary flex items-center gap-1.5" : "text-muted-foreground"}>
                    {g.undated && <CalendarClock className="w-3.5 h-3.5" />}
                    {g.title}
                  </span>
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {formatHours(g.minutes)} Std
                  </span>
                </div>
                {g.entries.map((e) => {
                  const billed = !!e.invoice_item_id;
                  return (
                    <div key={e.id} className="group flex items-center gap-3 px-4 py-2.5 border-t text-sm">
                      <span className={`w-[74px] shrink-0 text-xs tabular-nums ${e.date ? "text-muted-foreground" : "text-primary"}`}>
                        {e.date ? formatDay(e.date) : "offen"}
                      </span>
                      <span className="w-[62px] shrink-0 font-medium tabular-nums">
                        {shortDuration(e.minutes)}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{e.description}</span>
                      {!e.billable && (
                        <Badge variant="secondary" className="h-5 font-normal text-[10px]">nicht abrechenbar</Badge>
                      )}
                      {billed && (
                        <Badge variant="outline" className="h-5 font-normal text-[10px]">abgerechnet</Badge>
                      )}
                      <span className="w-[86px] text-right text-xs text-muted-foreground tabular-nums shrink-0">
                        {e.billable ? formatEuro(valueOf(e, project)) : "—"}
                      </span>
                      <span className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={billed}
                          title="Ändern" onClick={() => startEdit(e)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={billed}
                          title="Löschen" onClick={() => setToDelete(e)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {list.length > 0 && (
            <div className="flex items-center px-4 py-3 border-t-2 bg-muted/40 text-sm font-semibold">
              Summe offen
              <span className="ml-auto tabular-nums">
                {formatHours(totals.openMinutes)} Std · {formatEuro(totals.openValue)}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
        </div>
      </DialogContent>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete
                ? `${shortDuration(toDelete.minutes)} — ${toDelete.description}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) {
                  if (editId === toDelete.id) resetCapture();
                  await del.mutateAsync(toDelete.id);
                }
                setToDelete(null);
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateInvoiceFromTimeDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        entries={openEntries}
        projects={projects ?? []}
        clients={clients ?? []}
      />
    </Dialog>
  );
}

function SmallTile({ label, value, unit, foot, accent }: {
  label: string; value: string; unit?: string; foot: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-primary/40 bg-primary/5" : ""}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`block text-xl font-semibold tabular-nums mt-0.5 ${accent ? "text-primary" : ""}`}>
        {value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </span>
      <span className="block text-xs text-muted-foreground tabular-nums">{foot}</span>
    </div>
  );
}
