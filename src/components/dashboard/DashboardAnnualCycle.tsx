// Startseite: Jahreszyklus aller WEGs im laufenden Wirtschaftsjahr.
// Je WEG eine Zeile mit 15 Feldern (erledigt / in Arbeit / offen). Fährt man
// mit der Maus über ein Feld, steht dort, um welchen Schritt es geht und wie
// sein Stand ist. Bearbeitet wird weiterhin auf der Seite „Jahreszyklus“.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ANNUAL_CYCLE_TASKS, buildFiscalYears, type AnnualCycleStatus } from "@/lib/annualCycle";
import { fmt } from "./dashboardDates";

interface BuildingRow {
  id: string;
  name: string;
  fyStart: string;
  fyLabel: string;
}

interface TaskRow {
  building_id: string;
  task_key: string;
  status: AnnualCycleStatus;
  completed_at: string | null;
  note: string | null;
  fiscal_year_start: string;
}

const SEG_CLASS: Record<AnnualCycleStatus, string> = {
  done: "bg-emerald-600",
  in_progress: "bg-primary",
  open: "bg-muted-foreground/20",
};

const STATUS_TEXT: Record<AnnualCycleStatus, string> = {
  done: "Erledigt",
  in_progress: "In Arbeit",
  open: "Offen",
};

const TOTAL = ANNUAL_CYCLE_TASKS.length;

export function DashboardAnnualCycle() {
  const navigate = useNavigate();

  const { data: buildings = [], isLoading } = useQuery({
    queryKey: ["dashboard-jz-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, fiscal_year_start_month, fiscal_year_start_day")
        .eq("management_mode", "weg")
        .order("name");
      if (error) throw error;
      return ((data || []) as any[]).map((b) => {
        // Index 2 = das laufende Wirtschaftsjahr dieses Hauses
        const fy = buildFiscalYears(undefined, {
          startMonth: b.fiscal_year_start_month ?? 1,
          startDay: b.fiscal_year_start_day ?? 1,
        })[2];
        return { id: b.id, name: b.name, fyStart: fy.start, fyLabel: fy.label } as BuildingRow;
      });
    },
    staleTime: 10 * 60_000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["dashboard-jz-tasks", buildings.map((b) => `${b.id}:${b.fyStart}`).join(",")],
    queryFn: async () => {
      const passend = new Set(buildings.map((b) => `${b.id}:${b.fyStart}`));
      const starts = Array.from(new Set(buildings.map((b) => b.fyStart)));
      const { data, error } = await supabase
        .from("annual_cycle_tasks")
        .select("building_id, task_key, status, completed_at, note, fiscal_year_start")
        .in("fiscal_year_start", starts)
        .in("building_id", buildings.map((b) => b.id));
      if (error) throw error;
      return ((data || []) as TaskRow[]).filter((r) => passend.has(`${r.building_id}:${r.fiscal_year_start}`));
    },
    enabled: buildings.length > 0,
    staleTime: 60_000,
  });

  const zeilen = useMemo(() => {
    const byBuilding = new Map<string, Map<string, TaskRow>>();
    tasks.forEach((t) => {
      if (!byBuilding.has(t.building_id)) byBuilding.set(t.building_id, new Map());
      byBuilding.get(t.building_id)!.set(t.task_key, t);
    });
    return buildings.map((b) => {
      const map = byBuilding.get(b.id);
      const schritte = ANNUAL_CYCLE_TASKS.map((t, i) => {
        const row = map?.get(t.key);
        return {
          key: t.key,
          nr: i + 1,
          label: t.label,
          status: (row?.status ?? "open") as AnnualCycleStatus,
          completedAt: row?.completed_at ?? null,
          note: row?.note ?? null,
        };
      });
      const erledigt = schritte.filter((s) => s.status === "done").length;
      const naechster = schritte.find((s) => s.status !== "done") ?? null;
      return { ...b, schritte, erledigt, naechster };
    });
  }, [buildings, tasks]);

  const jahrLabel = useMemo(() => {
    const labels = Array.from(new Set(buildings.map((b) => b.fyLabel)));
    return labels.length === 1 ? `Wirtschaftsjahr ${labels[0]}` : "Laufendes Wirtschaftsjahr je WEG";
  }, [buildings]);

  return (
    <section aria-labelledby="h-zyklus" className="rounded-xl border bg-card px-5 pt-4 pb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="h-zyklus" className="text-base font-semibold">Jahreszyklus</h2>
          <p className="text-sm text-muted-foreground">
            {jahrLabel} · {TOTAL} Schritte je WEG · mit der Maus über ein Feld fahren für Details
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-3.5 rounded-sm", SEG_CLASS.done)} />erledigt</span>
          <span className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-3.5 rounded-sm", SEG_CLASS.in_progress)} />in Arbeit</span>
          <span className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-3.5 rounded-sm", SEG_CLASS.open)} />offen</span>
          <button type="button" onClick={() => navigate("/jahreszyklus")} className="text-sm font-semibold text-primary hover:underline">
            Bearbeiten
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : zeilen.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine WEGs vorhanden.</p>
      ) : (
        <div className="max-h-[440px] overflow-y-auto -mx-2">
          {zeilen.map((z) => (
            <div
              key={z.id}
              className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)_52px_minmax(0,240px)] items-center gap-x-4 gap-y-1.5 px-2 py-2.5 border-t first:border-t-0 border-border/60 rounded-lg hover:bg-muted/40"
            >
              <button
                type="button"
                onClick={() => navigate(`/buildings/${z.id}`)}
                className="truncate text-left text-sm font-semibold hover:text-primary"
                title={z.name}
              >
                {z.name}
              </button>

              <div className="flex gap-[3px]" aria-label={`${z.erledigt} von ${TOTAL} Schritten erledigt`}>
                {z.schritte.map((s) => (
                  <Tooltip key={s.key} delayDuration={80}>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "h-3 flex-1 rounded-[3px] cursor-help transition-transform hover:scale-y-150",
                          SEG_CLASS[s.status],
                          z.naechster?.key === s.key && "ring-2 ring-primary/40 ring-offset-1 ring-offset-card",
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] p-3">
                      <p className="text-[11px] text-muted-foreground">
                        {z.name} · Schritt {s.nr} von {TOTAL}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">{s.label}</p>
                      <p className="mt-1 text-xs">
                        <span
                          className={cn(
                            "font-semibold",
                            s.status === "done" && "text-emerald-700 dark:text-emerald-400",
                            s.status === "in_progress" && "text-orange-700 dark:text-orange-400",
                          )}
                        >
                          {STATUS_TEXT[s.status]}
                        </span>
                        {s.status === "done" && s.completedAt ? ` am ${fmt(s.completedAt, "dd.MM.yyyy")}` : ""}
                        {z.naechster?.key === s.key ? " · steht als Nächstes an" : ""}
                      </p>
                      {s.note && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{s.note}</p>}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>

              <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">
                {z.erledigt}/{TOTAL}
              </span>

              <span className="truncate text-[13px] text-muted-foreground">
                {z.naechster ? (
                  <>
                    Als Nächstes: <span className="font-semibold text-foreground">{z.naechster.label}</span>
                  </>
                ) : (
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Alles erledigt</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
