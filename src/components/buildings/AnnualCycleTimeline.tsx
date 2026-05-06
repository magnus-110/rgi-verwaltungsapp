import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarClock, Check, Clock, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANNUAL_CYCLE_TASKS, STATUS_LABEL,
  buildFiscalYears, type AnnualCycleStatus,
} from "@/lib/annualCycle";

interface Props {
  buildingId: string;
  onOpenFullView?: () => void;
}

interface TaskRow {
  task_key: string;
  status: AnnualCycleStatus;
  completed_at: string | null;
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

export const AnnualCycleTimeline = ({ buildingId, onOpenFullView }: Props) => {
  const qc = useQueryClient();
  const fiscalYears = useMemo(() => buildFiscalYears(), []);
  const [selected, setSelected] = useState(fiscalYears[2]);

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
  }, [buildingId, selected.start]); // eslint-disable-line

  const { data: tasks = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("annual_cycle_tasks")
        .select("task_key, status, completed_at")
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
        <div className="flex items-center gap-2">
          <Select
            value={selected.start}
            onValueChange={(v) => setSelected(fiscalYears.find(f => f.start === v)!)}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fiscalYears.map(fy => (
                <SelectItem key={fy.start} value={fy.start}>WJ {fy.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onOpenFullView && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenFullView}>
              Details
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-4 pt-1">
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex items-start min-w-max gap-0">
            {ANNUAL_CYCLE_TASKS.map((tDef, idx) => {
              const row = byKey.get(tDef.key);
              const status: AnnualCycleStatus = row?.status ?? "open";
              const style = STATUS_STYLES[status];
              const Icon = style.icon;
              const isLast = idx === ANNUAL_CYCLE_TASKS.length - 1;
              return (
                <div key={tDef.key} className="flex items-start" style={{ minWidth: 90 }}>
                  <div className="flex flex-col items-center w-[90px]">
                    <button
                      type="button"
                      onClick={onOpenFullView}
                      className={cn(
                        "w-9 h-9 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110",
                        style.dot
                      )}
                      title={`${tDef.label} – ${STATUS_LABEL[status]}${row?.completed_at ? ` (${row.completed_at})` : ""}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                    <p className="text-[10px] leading-tight text-center mt-1.5 px-1 line-clamp-2 text-muted-foreground">
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
      </CardContent>
    </Card>
  );
};
