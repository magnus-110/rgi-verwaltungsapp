import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANNUAL_CYCLE_TASKS, STATUS_CLASSES, STATUS_LABEL,
  buildFiscalYears, type AnnualCycleStatus,
} from "@/lib/annualCycle";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useFiscalYearContext } from "@/contexts/FiscalYearContext";


interface BuildingRow {
  id: string;
  name: string;
  management_mode: "weg" | "rent";
}

interface TaskRow {
  id: string;
  building_id: string;
  task_key: string;
  status: AnnualCycleStatus;
  completed_at: string | null;
  note: string | null;
}

const STATUS_DOT: Record<AnnualCycleStatus, string> = {
  open: "bg-muted",
  in_progress: "bg-orange-500",
  done: "bg-emerald-500",
};

export const Jahreszyklus = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fyCtx = useFiscalYearContext();
  const fiscalYears = useMemo(() => buildFiscalYears(), []);
  const ctxYear = fyCtx.globalFiscalYear;
  const initial =
    (ctxYear != null && fiscalYears.find((f) => Number(f.label) === ctxYear)) ||
    fiscalYears[2];
  const [selected, setSelected] = useState(initial);
  useEffect(() => {
    if (ctxYear == null) return;
    const m = fiscalYears.find((f) => Number(f.label) === ctxYear);
    if (m && m.start !== selected.start) setSelected(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxYear]);
  useEffect(() => {
    const y = Number(selected.label);
    if (Number.isFinite(y) && fyCtx.globalFiscalYear !== y) fyCtx.setGlobalFiscalYear(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.start]);
  const [filter, setFilter] = useState<"all" | "open">("all");
  const [editing, setEditing] = useState<{ row: TaskRow; building: BuildingRow; label: string } | null>(null);

  // Buildings for current management mode
  const { data: buildings = [] } = useQuery({
    queryKey: ["jz-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, management_mode")
        .eq("management_mode", "weg")
        .order("name");
      if (error) throw error;
      return (data || []) as BuildingRow[];
    },
  });

  // Seed all buildings for current year
  useEffect(() => {
    if (!buildings.length) return;
    Promise.all(
      buildings.map(b =>
        supabase.rpc("seed_annual_cycle_tasks", {
          p_building_id: b.id,
          p_fiscal_year_start: selected.start,
          p_fiscal_year_end: selected.end,
        })
      )
    ).then(() => qc.invalidateQueries({ queryKey: ["jz-tasks"] }));
  }, [buildings, selected.start]); // eslint-disable-line

  const { data: tasks = [] } = useQuery({
    queryKey: ["jz-tasks", selected.start],
    queryFn: async () => {
      const ids = buildings.map(b => b.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("annual_cycle_tasks")
        .select("id, building_id, task_key, status, completed_at, note")
        .eq("fiscal_year_start", selected.start)
        .in("building_id", ids);
      if (error) throw error;
      return (data || []) as TaskRow[];
    },
    enabled: buildings.length > 0,
  });

  const tasksByBuilding = useMemo(() => {
    const m = new Map<string, Map<string, TaskRow>>();
    tasks.forEach(t => {
      if (!m.has(t.building_id)) m.set(t.building_id, new Map());
      m.get(t.building_id)!.set(t.task_key, t);
    });
    return m;
  }, [tasks]);

  const visibleBuildings = useMemo(() => {
    if (filter === "all") return buildings;
    return buildings.filter(b => {
      const map = tasksByBuilding.get(b.id);
      if (!map) return true;
      return ANNUAL_CYCLE_TASKS.some(t => (map.get(t.key)?.status ?? "open") !== "done");
    });
  }, [buildings, tasksByBuilding, filter]);

  const updateRow = async (id: string, patch: Partial<TaskRow>) => {
    const { error } = await supabase.from("annual_cycle_tasks").update(patch).eq("id", id);
    if (error) {
      toast.error("Speichern fehlgeschlagen");
      return;
    }
    qc.invalidateQueries({ queryKey: ["jz-tasks"] });
  };

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            Jahreszyklus
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Status der jährlichen WEG-Aufgaben pro Wirtschaftsjahr.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v: "all" | "open") => setFilter(v)}>
            <SelectTrigger className="h-9 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle WEGs</SelectItem>
              <SelectItem value="open">Mit offenen Aufgaben</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selected.start} onValueChange={(v) => setSelected(fiscalYears.find(f => f.start === v)!)}>
            <SelectTrigger className="h-9 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fiscalYears.map(fy => (
                <SelectItem key={fy.start} value={fy.start}>Wirtschaftsjahr {fy.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-2 sticky left-0 bg-muted/30 z-10 min-w-[180px]">WEG</th>
                  {ANNUAL_CYCLE_TASKS.map((t, i) => (
                    <th key={t.key} className="text-center p-2 font-medium text-[10px] leading-tight" title={t.label}>
                      <div className="opacity-60">{i + 1}</div>
                      <div className="max-w-[80px] mx-auto truncate">{t.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleBuildings.map(b => {
                  const map = tasksByBuilding.get(b.id);
                  return (
                    <tr key={b.id} className="border-b hover:bg-accent/30">
                      <td className="p-2 sticky left-0 bg-card z-10 font-medium">
                        <button
                          className="text-left hover:text-primary truncate w-full"
                          onClick={() => navigate(`/buildings/${b.id}`)}
                        >
                          {b.name}
                        </button>
                      </td>
                      {ANNUAL_CYCLE_TASKS.map(t => {
                        const row = map?.get(t.key);
                        const status = row?.status ?? "open";
                        return (
                          <td key={t.key} className="p-1 text-center">
                            <button
                              className={cn(
                                "w-full h-9 rounded border flex items-center justify-center gap-1 transition-colors hover:opacity-80",
                                STATUS_CLASSES[status]
                              )}
                              onClick={() => row && setEditing({ row, building: b, label: t.label })}
                              title={`${t.label}: ${STATUS_LABEL[status]}${row?.completed_at ? ` (${row.completed_at})` : ""}`}
                            >
                              <span className={cn("w-2 h-2 rounded-full", STATUS_DOT[status])} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {visibleBuildings.length === 0 && (
                  <tr>
                    <td colSpan={ANNUAL_CYCLE_TASKS.length + 1} className="p-6 text-center text-muted-foreground">
                      Keine Gebäude gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Legende */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-muted" /> Offen</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500" /> In Bearbeitung</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Abgeschlossen</span>
      </div>

      {/* Edit Sheet */}
      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing?.label}</SheetTitle>
          </SheetHeader>
          {editing && (
            <div className="space-y-4 mt-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">WEG</p>
                <p className="text-sm font-medium">{editing.building.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Select
                  value={editing.row.status}
                  onValueChange={(v: AnnualCycleStatus) => {
                    const patch: Partial<TaskRow> = { status: v };
                    if (v === "done" && !editing.row.completed_at) {
                      patch.completed_at = new Date().toISOString().slice(0, 10);
                    }
                    updateRow(editing.row.id, patch);
                    setEditing({ ...editing, row: { ...editing.row, ...patch } });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["open", "in_progress", "done"] as AnnualCycleStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Datum</p>
                <Input
                  type="date"
                  value={editing.row.completed_at || ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    updateRow(editing.row.id, { completed_at: v });
                    setEditing({ ...editing, row: { ...editing.row, completed_at: v } });
                  }}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notiz</p>
                <Textarea
                  value={editing.row.note || ""}
                  onChange={(e) => {
                    updateRow(editing.row.id, { note: e.target.value });
                    setEditing({ ...editing, row: { ...editing.row, note: e.target.value } });
                  }}
                  rows={4}
                />
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate(`/buildings/${editing.building.id}`)}>
                Zum Gebäude
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Jahreszyklus;
