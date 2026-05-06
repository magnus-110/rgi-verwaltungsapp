import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarClock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANNUAL_CYCLE_TASKS, STATUS_LABEL,
  buildFiscalYears, type AnnualCycleStatus,
} from "@/lib/annualCycle";
import { toast } from "sonner";

interface BuildingRow {
  id: string;
  name: string;
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
  open: "bg-muted-foreground/30",
  in_progress: "bg-orange-500",
  done: "bg-emerald-500",
};

export const AnnualCycleDashboardWidget = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fiscalYears = useMemo(() => buildFiscalYears(), []);
  const [selected, setSelected] = useState(fiscalYears[2]);
  const [open, setOpen] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["jz-widget-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name")
        .eq("management_mode", "weg")
        .order("name");
      if (error) throw error;
      return (data || []) as BuildingRow[];
    },
    enabled: open,
  });

  // Seed pro Building beim Aufklappen
  useEffect(() => {
    if (!open || !buildings.length) return;
    Promise.all(
      buildings.map(b =>
        supabase.rpc("seed_annual_cycle_tasks", {
          p_building_id: b.id,
          p_fiscal_year_start: selected.start,
          p_fiscal_year_end: selected.end,
        })
      )
    ).then(() => qc.invalidateQueries({ queryKey: ["jz-widget-tasks"] }));
  }, [open, buildings, selected.start]); // eslint-disable-line

  const { data: tasks = [] } = useQuery({
    queryKey: ["jz-widget-tasks", selected.start, buildings.length],
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
    enabled: open && buildings.length > 0,
  });

  const updateRow = async (id: string, patch: Partial<TaskRow>) => {
    const { error } = await supabase.from("annual_cycle_tasks").update(patch).eq("id", id);
    if (error) {
      toast.error("Speichern fehlgeschlagen");
      return;
    }
    qc.invalidateQueries({ queryKey: ["jz-widget-tasks"] });
  };

  const tasksByBuilding = useMemo(() => {
    const m = new Map<string, Map<string, TaskRow>>();
    tasks.forEach(t => {
      if (!m.has(t.building_id)) m.set(t.building_id, new Map());
      m.get(t.building_id)!.set(t.task_key, t);
    });
    return m;
  }, [tasks]);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardHeader className="p-3 md:p-4 flex-row items-center justify-between space-y-0 gap-2 hover:bg-muted/40 transition-colors rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <CalendarClock className="h-5 w-5 text-primary" />
                Jahreszyklus aller WEGs
              </CardTitle>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {open && (
                  <Select
                    value={selected.start}
                    onValueChange={(v) => setSelected(fiscalYears.find(f => f.start === v)!)}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fiscalYears.map(fy => (
                        <SelectItem key={fy.start} value={fy.start}>{fy.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0 border-t">
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <tr>
                    <th className="text-left p-2 sticky left-0 bg-muted/80 z-20 min-w-[180px] border-r">WEG</th>
                    {ANNUAL_CYCLE_TASKS.map((t, i) => (
                      <th key={t.key} className="text-center p-2 font-medium text-[10px] leading-tight" title={t.label}>
                        <div className="opacity-60">{i + 1}</div>
                        <div className="max-w-[80px] mx-auto truncate">{t.label}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buildings.length === 0 && (
                    <tr><td colSpan={ANNUAL_CYCLE_TASKS.length + 1} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
                  )}
                  {buildings.map(b => {
                    const map = tasksByBuilding.get(b.id);
                    return (
                      <tr key={b.id} className="border-b hover:bg-accent/30">
                        <td className="p-2 sticky left-0 bg-card z-10 font-medium border-r">
                          <button
                            className="text-left hover:text-primary truncate w-full"
                            onClick={() => navigate(`/buildings/${b.id}`)}
                          >
                            {b.name}
                          </button>
                        </td>
                        {ANNUAL_CYCLE_TASKS.map(t => {
                          const row = map?.get(t.key);
                          const status: AnnualCycleStatus = row?.status ?? "open";
                          return (
                            <td key={t.key} className="p-1 text-center">
                              <button
                                className="w-full h-7 rounded flex items-center justify-center hover:bg-accent transition-colors"
                                onClick={() => navigate(`/buildings/${b.id}`)}
                                title={`${t.label}: ${STATUS_LABEL[status]}${row?.completed_at ? ` (${row.completed_at})` : ""}`}
                              >
                                <span className={cn("w-2.5 h-2.5 rounded-full", STATUS_DOT[status])} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground p-3 border-t">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" /> Offen</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> In Bearbeitung</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Abgeschlossen</span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
