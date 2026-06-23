import { useMemo, useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Users, Clock, ChevronRight, Pencil, Trash2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  useAllTimeEntries,
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

type ProfileLite = { user_id: string; first_name: string | null; last_name: string | null; email: string | null };

function useStaffProfiles() {
  return useQuery({
    queryKey: ["timeclock", "staff-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, role")
        .in("role", ["admin", "employee"]);
      if (error) throw error;
      return (data ?? []) as (ProfileLite & { role: string })[];
    },
  });
}

function displayName(p?: ProfileLite | null) {
  if (!p) return "Unbekannt";
  const n = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return n || p.email || "Unbekannt";
}

export function TimeClockAdminTab() {
  const [days, setDays] = useState(90);
  const { data: entries = [], isLoading } = useAllTimeEntries(days);
  const { data: profiles = [] } = useStaffProfiles();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const profilesById = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    for (const p of profiles) m.set(p.user_id, p);
    return m;
  }, [profiles]);

  const byUser = useMemo(() => {
    const m = new Map<string, TimeClockEntry[]>();
    for (const e of entries) {
      if (!m.has(e.user_id)) m.set(e.user_id, []);
      m.get(e.user_id)!.push(e);
    }
    return m;
  }, [entries]);

  const summary = useMemo(() => {
    const rows = Array.from(byUser.entries()).map(([uid, list]) => ({
      uid,
      name: displayName(profilesById.get(uid)),
      today: sumMinutesSince(list, startOfToday(), now),
      week: sumMinutesSince(list, startOfWeek(), now),
      month: sumMinutesSince(list, startOfMonth(), now),
      active: list.find((e) => !e.ended_at) ?? null,
      lastAt: list[0]?.started_at ?? null,
    }));
    rows.sort((a, b) => b.week - a.week);
    return rows;
  }, [byUser, profilesById, now]);

  const totals = useMemo(() => ({
    activeNow: summary.filter((r) => r.active).length,
    today: summary.reduce((s, r) => s + r.today, 0),
    week: summary.reduce((s, r) => s + r.week, 0),
    month: summary.reduce((s, r) => s + r.month, 0),
  }), [summary]);

  if (selectedUser) {
    return (
      <UserDrilldown
        userId={selectedUser}
        entries={byUser.get(selectedUser) ?? []}
        profile={profilesById.get(selectedUser)}
        onBack={() => setSelectedUser(null)}
        now={now}
      />
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Stempelzeiten</h3>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Letzte 30 Tage</SelectItem>
            <SelectItem value="90">Letzte 90 Tage</SelectItem>
            <SelectItem value="180">Letzte 180 Tage</SelectItem>
            <SelectItem value="365">Letztes Jahr</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Users className="w-5 h-5" />} label="Aktuell aktiv" value={`${totals.activeNow}`} />
        <Kpi icon={<Clock className="w-5 h-5" />} label="Heute" value={fmtHM(totals.today)} />
        <Kpi icon={<Clock className="w-5 h-5" />} label="Diese Woche" value={fmtHM(totals.week)} />
        <Kpi icon={<Clock className="w-5 h-5" />} label="Diesen Monat" value={fmtHM(totals.month)} />
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
            <div className="col-span-4">Mitarbeiter</div>
            <div className="col-span-2 text-right">Heute</div>
            <div className="col-span-2 text-right">Woche</div>
            <div className="col-span-2 text-right">Monat</div>
            <div className="col-span-2 text-right">Letzte Aktivität</div>
          </div>
          {summary.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">Keine Einträge im Zeitraum.</div>
          )}
          {summary.map((r) => (
            <button
              key={r.uid}
              onClick={() => setSelectedUser(r.uid)}
              className="w-full grid grid-cols-12 px-4 py-3 items-center border-b last:border-b-0 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="col-span-4 flex items-center gap-2 min-w-0">
                {r.active && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="aktuell eingestempelt" />
                )}
                <span className="truncate">{r.name}</span>
              </div>
              <div className="col-span-2 text-right tabular-nums">{fmtHM(r.today)}</div>
              <div className="col-span-2 text-right tabular-nums">{fmtHM(r.week)}</div>
              <div className="col-span-2 text-right tabular-nums">{fmtHM(r.month)}</div>
              <div className="col-span-2 text-right text-xs text-muted-foreground flex items-center justify-end gap-1">
                {r.lastAt ? format(new Date(r.lastAt), "dd.MM. HH:mm", { locale: de }) : "—"}
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">{icon}{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </Card>
  );
}

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

function UserDrilldown({
  userId, entries, profile, onBack, now,
}: {
  userId: string;
  entries: TimeClockEntry[];
  profile?: ProfileLite;
  onBack: () => void;
  now: number;
}) {
  const upsert = useUpsertTimeEntry();
  const del = useDeleteTimeEntry();
  const [editId, setEditId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const exportCsv = () => {
    const rows = [["Datum", "Start", "Ende", "Dauer (min)", "Notiz", "Quelle"]];
    for (const e of entries) {
      const start = new Date(e.started_at);
      rows.push([
        format(start, "yyyy-MM-dd"),
        format(start, "HH:mm"),
        e.ended_at ? format(new Date(e.ended_at), "HH:mm") : "",
        String(durationMinutes(e, now)),
        (e.note ?? "").replace(/[\r\n;]/g, " "),
        e.source,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stempelzeiten_${displayName(profile).replace(/\s+/g, "_")}.csv`;
    a.click();
  };

  const totalAll = entries.reduce((s, e) => s + durationMinutes(e, now), 0);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>← Zurück</Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
          <Download className="w-4 h-4" /> CSV
        </Button>
      </div>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Mitarbeiter</div>
        <div className="text-xl font-semibold">{displayName(profile)}</div>
        <div className="text-xs text-muted-foreground mt-1">Σ Zeitraum: {fmtHM(totalAll)}</div>
      </Card>
      <Card className="p-0 overflow-hidden">
        {entries.length === 0 && <div className="p-6 text-sm text-muted-foreground text-center">Keine Einträge.</div>}
        <ul className="divide-y">
          {entries.map((e) => {
            const editing = editId === e.id;
            return (
              <li key={e.id} className="px-4 py-2">
                {editing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="datetime-local" value={editStart} onChange={(ev) => setEditStart(ev.target.value)} className="h-8 text-xs" />
                      <Input type="datetime-local" value={editEnd} onChange={(ev) => setEditEnd(ev.target.value)} className="h-8 text-xs" />
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          await upsert.mutateAsync({
                            id: e.id,
                            user_id: e.user_id,
                            started_at: fromLocalInput(editStart)!,
                            ended_at: fromLocalInput(editEnd),
                            note: e.note,
                          });
                          setEditId(null);
                        }}
                        disabled={upsert.isPending}
                      ><Check className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 group">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">
                        {format(new Date(e.started_at), "EEE dd.MM.yyyy · HH:mm", { locale: de })}
                        {" – "}
                        {e.ended_at ? format(new Date(e.ended_at), "HH:mm") : <span className="text-emerald-600">läuft</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmtHM(durationMinutes(e, now))}
                        {e.source === "manual" ? " · nachgetragen" : ""}
                        {e.edited_at ? " · bearbeitet" : ""}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                        setEditId(e.id);
                        setEditStart(toLocalInput(e.started_at));
                        setEditEnd(toLocalInput(e.ended_at));
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => del.mutate(e.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
