import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useMyTimeEntries,
  useUpsertTimeEntry,
  useDeleteTimeEntry,
  durationMinutes,
  fmtHM,
  sumMinutesSince,
  startOfToday,
  startOfWeek,
  startOfMonth,
  type TimeClockEntry,
} from "@/hooks/useTimeClock";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}

export function TimeClockPanel({ onClose: _onClose }: { onClose?: () => void }) {
  const { data: entries = [], isLoading } = useMyTimeEntries(60);
  const upsert = useUpsertTimeEntry();
  const del = useDeleteTimeEntry();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const totals = useMemo(() => ({
    today: sumMinutesSince(entries, startOfToday(), now),
    week: sumMinutesSince(entries, startOfWeek(), now),
    month: sumMinutesSince(entries, startOfMonth(), now),
  }), [entries, now]);

  const [editId, setEditId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editReason, setEditReason] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addStart, setAddStart] = useState("");
  const [addEnd, setAddEnd] = useState("");
  const [addReason, setAddReason] = useState("");
  const [entryToDelete, setEntryToDelete] = useState<TimeClockEntry | null>(null);

  const startEdit = (e: TimeClockEntry) => {
    setEditId(e.id);
    setEditStart(toLocalInput(e.started_at));
    setEditEnd(toLocalInput(e.ended_at));
    setEditReason(e.reason ?? "");
  };
  const cancelEdit = () => {
    setEditId(null);
    setEditReason("");
  };
  const saveEdit = async (e: TimeClockEntry) => {
    await upsert.mutateAsync({
      id: e.id,
      started_at: fromLocalInput(editStart)!,
      ended_at: fromLocalInput(editEnd),
      note: e.note,
      reason: editReason.trim() || null,
    });
    cancelEdit();
  };

  const recent = entries.slice(0, 7);

  return (
    <div className="flex flex-col w-full">
      <div className="p-4 border-b">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Meine Zeit</div>
        <div className="grid grid-cols-3 gap-3">
          <StatBlock label="Heute" value={fmtHM(totals.today)} />
          <StatBlock label="Diese Woche" value={fmtHM(totals.week)} />
          <StatBlock label="Diesen Monat" value={fmtHM(totals.month)} />
        </div>
      </div>

      <div className="px-4 py-3 max-h-[360px] overflow-y-auto">
        {isLoading && <div className="text-sm text-muted-foreground">Lädt…</div>}
        {!isLoading && recent.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">Noch keine Stempelungen.</div>
        )}
        <ul className="divide-y">
          {recent.map((e) => {
            const isOpen = !e.ended_at;
            const mins = durationMinutes(e, now);
            const editing = editId === e.id;
            return (
              <li key={e.id} className="py-2">
                {editing ? (
                  <div className="space-y-2 rounded-md bg-muted/40 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <LabeledInput label="Start" value={editStart} onChange={setEditStart} />
                      <LabeledInput label="Ende" value={editEnd} onChange={setEditEnd} />
                    </div>
                    <Textarea
                      value={editReason}
                      onChange={(ev) => setEditReason(ev.target.value)}
                      placeholder="Begründung der Änderung"
                      className="text-xs min-h-[56px]"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>Abbrechen</Button>
                      <Button
                        size="sm"
                        disabled={!editStart || !editReason.trim() || upsert.isPending}
                        onClick={() => saveEdit(e)}
                      >
                        Senden
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">
                        {format(new Date(e.started_at), "EEE dd.MM. · HH:mm", { locale: de })}
                        {" – "}
                        {e.ended_at ? format(new Date(e.ended_at), "HH:mm") : <span className="text-emerald-600">läuft</span>}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{fmtHM(mins)}{isOpen ? " (laufend)" : ""}</span>
                        {e.source === "manual" && <span>· nachgetragen</span>}
                        {e.status === "pending" && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 border border-amber-200">wartet auf Freigabe</span>
                        )}
                        {e.status === "rejected" && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800 border border-red-200">abgelehnt</span>
                        )}
                      </div>
                      {e.reason && (
                        <div className="text-[11px] text-muted-foreground italic mt-0.5 truncate">„{e.reason}"</div>
                      )}
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(e)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setEntryToDelete(e)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t p-3">
        {addOpen ? (
          <div className="space-y-2 rounded-md bg-muted/40 p-3">
            <div className="text-xs font-medium">Eintrag nachtragen</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <LabeledInput label="Start" value={addStart} onChange={setAddStart} />
              <LabeledInput label="Ende" value={addEnd} onChange={setAddEnd} />
            </div>
            <Textarea
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
              placeholder="Begründung (z. B. Termin außer Haus, vergessen einzustempeln)"
              className="text-xs min-h-[60px]"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => { setAddOpen(false); setAddReason(""); }}>
                <X className="h-3.5 w-3.5 mr-1" /> Abbrechen
              </Button>
              <Button
                size="sm"
                disabled={!addStart || !addEnd || !addReason.trim() || upsert.isPending}
                onClick={async () => {
                  await upsert.mutateAsync({
                    started_at: fromLocalInput(addStart)!,
                    ended_at: fromLocalInput(addEnd),
                    source: "manual",
                    reason: addReason.trim(),
                  });
                  setAddOpen(false);
                  setAddStart("");
                  setAddEnd("");
                  setAddReason("");
                }}
              >
                Senden
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Manuell nachtragen
          </Button>
        )}
      </div>

      <AlertDialog open={!!entryToDelete} onOpenChange={(open) => !open && setEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {entryToDelete && (
                <span>
                  Möchtest du den Eintrag vom{" "}
                  <strong>{format(new Date(entryToDelete.started_at), "dd.MM. yyyy", { locale: de })}</strong>{" "}
                  wirklich löschen? Diese Aktion lässt sich nicht rückgängig machen.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEntryToDelete(null)}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (entryToDelete) {
                  del.mutate(entryToDelete.id);
                  setEntryToDelete(null);
                }
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-xs w-full mt-0.5"
      />
    </label>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
