import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarClock, Check, Clock, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANNUAL_CYCLE_TASKS, STATUS_LABEL,
  buildFiscalYears, type AnnualCycleStatus,
} from "@/lib/annualCycle";
import { toast } from "sonner";

interface Props {
  buildingId: string;
}

interface TaskRow {
  id: string;
  task_key: string;
  status: AnnualCycleStatus;
  completed_at: string | null;
  note: string | null;
}

const STATUS_STYLES: Record<AnnualCycleStatus, { dot: string; ring: string; icon: any }> = {
  open: {
    dot: "bg-muted text-muted-foreground border-border",
    ring: "bg-border",
    icon: Circle,
  },
  in_progress: {
    dot: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/40",
    ring: "bg-orange-500/40",
    icon: Clock,
  },
  done: {
    dot: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40",
    ring: "bg-emerald-500/60",
    icon: Check,
  },
};

export const AnnualCycleTimeline = ({ buildingId }: Props) => {
  const qc = useQueryClient();
  const { data: bCfg } = useQuery({
    queryKey: ["building-fy-cfg", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("fiscal_year_start_month, fiscal_year_start_day")
        .eq("id", buildingId)
        .maybeSingle();
      if (error) throw error;
      return (data || { fiscal_year_start_month: 1, fiscal_year_start_day: 1 }) as {
        fiscal_year_start_month: number;
        fiscal_year_start_day: number;
      };
    },
  });
  const fiscalYears = useMemo(
    () =>
      buildFiscalYears(undefined, {
        startMonth: bCfg?.fiscal_year_start_month ?? 1,
        startDay: bCfg?.fiscal_year_start_day ?? 1,
      }),
    [bCfg?.fiscal_year_start_month, bCfg?.fiscal_year_start_day]
  );
  const [selected, setSelected] = useState(fiscalYears[2]);
  useEffect(() => {
    setSelected(fiscalYears[2]);
  }, [fiscalYears]);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const queryKey = ["annual-cycle-timeline", buildingId, selected.start];

  useEffect(() => {
    (async () => {
      await supabase.rpc("seed_annual_cycle_tasks", {
        p_building_id: buildingId,
        p_fiscal_year_start: selected.start,
        p_fiscal_year_end: selected.end,
      });
      qc.invalidateQueries({ queryKey });
    })();
    setEditingKey(null);
  }, [buildingId, selected.start]); // eslint-disable-line

  const { data: tasks = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("annual_cycle_tasks")
        .select("id, task_key, status, completed_at, note")
        .eq("building_id", buildingId)
        .eq("fiscal_year_start", selected.start);
      if (error) throw error;
      return (data || []) as TaskRow[];
    },
  });

  const byKey = useMemo(() => {
    const m = new Map<string, TaskRow>();
    tasks.forEach(t => m.set(t.task_key, t));
    return m;
  }, [tasks]);

  const doneCount = ANNUAL_CYCLE_TASKS.filter(t => byKey.get(t.key)?.status === "done").length;

  const updateRow = async (id: string, patch: Partial<TaskRow>) => {
    const { error } = await supabase.from("annual_cycle_tasks").update(patch).eq("id", id);
    if (error) {
      toast.error("Speichern fehlgeschlagen");
      return;
    }
    qc.invalidateQueries({ queryKey });
  };

  const editingRow = editingKey ? byKey.get(editingKey) : null;
  const editingDef = editingKey ? ANNUAL_CYCLE_TASKS.find(t => t.key === editingKey) : null;

  return (
    <Card>
      <CardHeader className="p-3 md:p-4 pb-2 flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-sm md:text-base flex items-center gap-2 min-w-0">
          <CalendarClock className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate">Jahreszyklus</span>
          <span className="text-xs font-normal text-muted-foreground shrink-0">
            {doneCount}/{ANNUAL_CYCLE_TASKS.length}
          </span>
        </CardTitle>
        <Select
          value={selected.start}
          onValueChange={(v) => setSelected(fiscalYears.find(f => f.start === v)!)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fiscalYears.map(fy => (
              <SelectItem key={fy.start} value={fy.start}>{fy.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-3 md:p-4 pt-1 space-y-3">
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex items-start min-w-max gap-0">
            {ANNUAL_CYCLE_TASKS.map((tDef, idx) => {
              const row = byKey.get(tDef.key);
              const status: AnnualCycleStatus = row?.status ?? "open";
              const style = STATUS_STYLES[status];
              const Icon = style.icon;
              const isLast = idx === ANNUAL_CYCLE_TASKS.length - 1;
              const isActive = editingKey === tDef.key;
              return (
                <div key={tDef.key} className="flex items-start" style={{ minWidth: 90 }}>
                  <div className="flex flex-col items-center w-[90px]">
                    <button
                      type="button"
                      onClick={() => setEditingKey(isActive ? null : tDef.key)}
                      className={cn(
                        "w-9 h-9 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110",
                        style.dot,
                        isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      )}
                      title={`${tDef.label} – ${STATUS_LABEL[status]}${row?.completed_at ? ` (${row.completed_at})` : ""}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                    <p className={cn(
                      "text-[10px] leading-tight text-center mt-1.5 px-1 line-clamp-2",
                      isActive ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {tDef.label}
                    </p>
                  </div>
                  {!isLast && (
                    <div className={cn("h-0.5 mt-[18px] w-4", style.ring)} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {editingRow && editingDef && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{editingDef.label}</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingKey(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Status</p>
                <Select
                  value={editingRow.status}
                  onValueChange={(v: AnnualCycleStatus) => {
                    const patch: Partial<TaskRow> = { status: v };
                    if (v === "done" && !editingRow.completed_at) {
                      patch.completed_at = new Date().toISOString().slice(0, 10);
                    }
                    updateRow(editingRow.id, patch);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["open", "in_progress", "done"] as AnnualCycleStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Datum</p>
                <Input
                  type="date"
                  value={editingRow.completed_at || ""}
                  onChange={(e) => updateRow(editingRow.id, { completed_at: e.target.value || null })}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Notiz</p>
              <Textarea
                defaultValue={editingRow.note || ""}
                onBlur={(e) => {
                  if ((editingRow.note || "") !== e.target.value) {
                    updateRow(editingRow.id, { note: e.target.value || null });
                  }
                }}
                placeholder="Optional..."
                rows={2}
                className="text-xs bg-background"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
