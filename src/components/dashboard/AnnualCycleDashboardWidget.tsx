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
  /** 1-12, Standard 1. Sieben der WEGs rechnen nicht nach dem Kalenderjahr ab. */
  startMonth: number;
  /** 1-28, Standard 1. */
  startDay: number;
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
  // Gemerkt wird die Stelle in der Jahresliste, nicht ein festes Datum: jedes
  // Haus hat sein eigenes Wirtschaftsjahr, "das laufende" ist deshalb je Haus
  // ein anderer Zeitraum.
  const [yearIndex, setYearIndex] = useState(2);
  const [open, setOpen] = useState(false);

  const { data: buildings = [] } = useQuery({
    queryKey: ["jz-widget-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, fiscal_year_start_month, fiscal_year_start_day")
        .eq("management_mode", "weg")
        .order("name");
      if (error) throw error;
      return ((data || []) as any[]).map(b => ({
        id: b.id as string,
        name: b.name as string,
        startMonth: (b.fiscal_year_start_month as number) ?? 1,
        startDay: (b.fiscal_year_start_day as number) ?? 1,
      })) as BuildingRow[];
    },
    enabled: open,
  });

  /** Das Wirtschaftsjahr an der gewaehlten Stelle — je Haus ein eigenes. */
  const wjFuer = (b: BuildingRow) => {
    const jahre = buildFiscalYears(undefined, { startMonth: b.startMonth, startDay: b.startDay });
    return jahre[yearIndex] ?? jahre[2];
  };

  // Die Beschriftung des Umschalters richtet sich nach dem Kalenderjahr; bei
  // verschobenen Haeusern ist damit das Wirtschaftsjahr gemeint, das in
  // diesem Jahr beginnt.
  const jahresLabels = useMemo(() => buildFiscalYears(), []);

  const wjSchluessel = useMemo(
    () => buildings.map(b => `${b.id}:${wjFuer(b).start}`).join(','),
    [buildings, yearIndex] // eslint-disable-line
  );

  // Seed pro Building beim Aufklappen — jedes Haus mit SEINEM Wirtschaftsjahr.
  // Vorher wurde hier fuer alle Haeuser das Kalenderjahr angelegt; bei den
  // verschobenen Haeusern entstanden dadurch Zeilen, die zu keinem ihrer
  // Wirtschaftsjahre gehoeren.
  useEffect(() => {
    if (!open || !buildings.length) return;
    Promise.all(
      buildings.map(b => {
        const wj = wjFuer(b);
        return supabase.rpc("seed_annual_cycle_tasks", {
          p_building_id: b.id,
          p_fiscal_year_start: wj.start,
          p_fiscal_year_end: wj.end,
        });
      })
    ).then(() => qc.invalidateQueries({ queryKey: ["jz-widget-tasks"] }));
  }, [open, wjSchluessel]); // eslint-disable-line

  const { data: tasks = [] } = useQuery({
    queryKey: ["jz-widget-tasks", wjSchluessel],
    queryFn: async () => {
      if (!buildings.length) return [];
      const passend = new Set(buildings.map(b => `${b.id}:${wjFuer(b).start}`));
      const starts = Array.from(new Set(buildings.map(b => wjFuer(b).start)));
      const { data, error } = await supabase
        .from("annual_cycle_tasks")
        .select("id, building_id, task_key, status, completed_at, note, fiscal_year_start")
        .in("fiscal_year_start", starts)
        .in("building_id", buildings.map(b => b.id));
      if (error) throw error;
      // Nur die Paarung Haus + sein eigenes Wirtschaftsjahr behalten.
      return ((data || []) as any[]).filter(
        r => passend.has(`${r.building_id}:${r.fiscal_year_start}`)
      ) as TaskRow[];
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
                    value={String(yearIndex)}
                    onValueChange={(v) => setYearIndex(Number(v))}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jahresLabels.map((fy, i) => (
                        <SelectItem key={fy.start} value={String(i)}>
                          Wirtschaftsjahr {fy.label}
                        </SelectItem>
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
                              {row ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      className="w-full h-7 rounded flex items-center justify-center hover:bg-accent transition-colors"
                                      title={`${t.label}: ${STATUS_LABEL[status]}${row.completed_at ? ` (${row.completed_at})` : ""}`}
                                    >
                                      <span className={cn("w-2.5 h-2.5 rounded-full", STATUS_DOT[status])} />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-3 space-y-2" align="center">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-medium truncate">{t.label}</p>
                                      <button
                                        className="text-[10px] text-muted-foreground hover:text-primary"
                                        onClick={() => navigate(`/buildings/${b.id}`)}
                                      >
                                        Gebäude →
                                      </button>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground -mt-1 truncate">{b.name}</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <p className="text-[10px] text-muted-foreground mb-1">Status</p>
                                        <Select
                                          value={row.status}
                                          onValueChange={(v: AnnualCycleStatus) => {
                                            const patch: Partial<TaskRow> = { status: v };
                                            if (v === "done" && !row.completed_at) {
                                              patch.completed_at = new Date().toISOString().slice(0, 10);
                                            }
                                            updateRow(row.id, patch);
                                          }}
                                        >
                                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {(["open", "in_progress", "done"] as AnnualCycleStatus[]).map(s => (
                                              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-muted-foreground mb-1">Datum</p>
                                        <Input
                                          type="date"
                                          value={row.completed_at || ""}
                                          onChange={(e) => updateRow(row.id, { completed_at: e.target.value || null })}
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-[10px] text-muted-foreground mb-1">Notiz</p>
                                      <Textarea
                                        defaultValue={row.note || ""}
                                        onBlur={(e) => {
                                          if ((row.note || "") !== e.target.value) {
                                            updateRow(row.id, { note: e.target.value || null });
                                          }
                                        }}
                                        rows={2}
                                        className="text-xs"
                                        placeholder="Optional…"
                                      />
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              ) : (
                                <span className={cn("inline-block w-2.5 h-2.5 rounded-full opacity-40", STATUS_DOT[status])} />
                              )}
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
