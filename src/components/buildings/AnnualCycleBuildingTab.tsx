import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CalendarClock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANNUAL_CYCLE_TASKS, STATUS_CLASSES, STATUS_LABEL,
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

export const AnnualCycleBuildingTab = ({ buildingId }: Props) => {
  const qc = useQueryClient();
  const fiscalYears = useMemo(() => buildFiscalYears(), []);
  const [selected, setSelected] = useState(fiscalYears[2]); // current year

  const queryKey = ["annual-cycle", buildingId, selected.start];

  // Seed missing rows on year switch
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

  const { data: tasks = [], isLoading } = useQuery({
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

  // Fetch the actual fiscal year range (may be shifted, e.g. 01.07.–30.06.)
  const fiscalYearNum = new Date(selected.start).getFullYear();
  const { data: period } = useQuery({
    queryKey: ["billing-period", buildingId, fiscalYearNum],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_periods")
        .select("period_from, period_to")
        .eq("building_id", buildingId)
        .eq("fiscal_year", fiscalYearNum)
        .maybeSingle();
      return data as { period_from: string; period_to: string } | null;
    },
  });

  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("T")[0].split("-");
    return `${d}.${m}.${y}`;
  };
  const periodFrom = period?.period_from ?? selected.start;
  const periodTo = period?.period_to ?? selected.end;
  const isShifted = !(periodFrom.endsWith("-01-01") && periodTo.endsWith("-12-31"));

  const byKey = useMemo(() => {
    const m = new Map<string, TaskRow>();
    tasks.forEach(t => m.set(t.task_key, t));
    return m;
  }, [tasks]);

  const updateField = async (id: string, patch: Partial<TaskRow>) => {
    const { error } = await supabase.from("annual_cycle_tasks").update(patch).eq("id", id);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey });
  };

  const setStatus = (row: TaskRow, status: AnnualCycleStatus) => {
    const patch: Partial<TaskRow> = { status };
    if (status === "done" && !row.completed_at) {
      patch.completed_at = new Date().toISOString().slice(0, 10);
    }
    updateField(row.id, patch);
  };

  return (
    <Card>
      <CardHeader className="p-3 md:p-4 pb-2 space-y-2">
        <div className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm md:text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Jahreszyklus
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
                <SelectItem key={fy.start} value={fy.start}>Wirtschaftsjahr {fy.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs font-mono">
            {fmtDate(periodFrom)} – {fmtDate(periodTo)}
          </Badge>
          {isShifted && (
            <Badge variant="secondary" className="text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30">
              Verschobenes Wirtschaftsjahr
            </Badge>
          )}
          {!period && (
            <span className="text-[11px] text-muted-foreground">
              (kein Abrechnungszeitraum hinterlegt – Standard Kalenderjahr)
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-4 pt-1 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
        {ANNUAL_CYCLE_TASKS.map((tDef, idx) => {
          const row = byKey.get(tDef.key);
          if (!row) return null;
          return (
            <div
              key={tDef.key}
              className={cn(
                "rounded-md border p-2.5 md:p-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3",
                STATUS_CLASSES[row.status]
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-xs font-mono opacity-60 w-5 shrink-0">{idx + 1}.</span>
                <span className="text-sm font-medium truncate">{tDef.label}</span>
                {tDef.auto && (
                  <Badge variant="outline" className="h-5 text-[10px] gap-1 shrink-0">
                    <Sparkles className="h-3 w-3" /> automatisch
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={row.status} onValueChange={(v) => setStatus(row, v as AnnualCycleStatus)}>
                  <SelectTrigger className="h-8 w-[150px] text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["open", "in_progress", "done"] as AnnualCycleStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={row.completed_at || ""}
                  onChange={(e) => updateField(row.id, { completed_at: e.target.value || null })}
                  className="h-8 w-[150px] text-xs bg-background"
                />
              </div>
              {row.status !== "open" && (
                <Textarea
                  value={row.note || ""}
                  onChange={(e) => updateField(row.id, { note: e.target.value })}
                  placeholder="Notiz (optional)"
                  className="text-xs bg-background md:max-w-[280px]"
                  rows={1}
                />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
