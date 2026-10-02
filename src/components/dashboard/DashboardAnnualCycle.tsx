// Startseite: Jahreszyklus aller WEGs.
//
// Wie auf der Seite „Jahreszyklus“: ein Block je Wirtschaftsjahr-Variante
// (Kalenderjahr, ab 1. Juli, …). Jeder Block hat seinen eigenen Jahresumschalter
// und eine Anzeige, im wievielten Monat des Wirtschaftsjahres man gerade ist.
// Je WEG eine Zeile mit 15 Feldern; fährt man mit der Maus über ein Feld, steht
// dort, um welchen Schritt es geht und wie sein Stand ist.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ANNUAL_CYCLE_TASKS,
  buildFiscalYears,
  type AnnualCycleStatus,
  type FiscalYearOption,
} from "@/lib/annualCycle";
import { useCycleBuildings, useCycleDefinitions, type CycleBuilding } from "@/hooks/useAnnualCycle";
import { fmt } from "./dashboardDates";

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

const MONAT = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const MONAT_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const WAHL_KEY = "rgi-dashboard-jz-wahl";

/** Gemerkt wird je Variante der Abstand zum laufenden Jahr (−1, 0, +1). */
type Wahl = Record<string, number>;

const leseWahl = (): Wahl => {
  try {
    const roh = localStorage.getItem(WAHL_KEY);
    const v = roh ? JSON.parse(roh) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const heuteIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const variantenName = (m: number, t: number) =>
  m === 1 && t === 1 ? "Kalenderjahr" : `Wirtschaftsjahr ab ${t}. ${MONAT[m - 1]}`;

/** Das Wirtschaftsjahr, in dem heute liegt (sonst das mittlere der Liste). */
const laufenderIndex = (jahre: FiscalYearOption[]) => {
  const heute = heuteIso();
  const i = jahre.findIndex((j) => j.start <= heute && heute <= j.end);
  return i >= 0 ? i : 2;
};

type Fortschritt =
  | { art: "laeuft"; monat: number }
  | { art: "vorbei" }
  | { art: "zukunft" };

/** Im wievielten Monat (1–12) des Wirtschaftsjahres sind wir heute? */
const fortschritt = (fy: FiscalYearOption): Fortschritt => {
  const heute = heuteIso();
  if (heute < fy.start) return { art: "zukunft" };
  if (heute > fy.end) return { art: "vorbei" };
  const [sy, sm, sd] = fy.start.split("-").map(Number);
  const [hy, hm, hd] = heute.split("-").map(Number);
  let monate = (hy - sy) * 12 + (hm - sm);
  if (hd < sd) monate -= 1;
  return { art: "laeuft", monat: Math.min(12, Math.max(1, monate + 1)) };
};

export function DashboardAnnualCycle() {
  const navigate = useNavigate();
  const [wahl, setWahl] = useState<Wahl>(leseWahl);

  const waehle = (variante: string, abstand: number) => {
    setWahl((alt) => {
      const neu = { ...alt, [variante]: abstand };
      try {
        localStorage.setItem(WAHL_KEY, JSON.stringify(neu));
      } catch {
        /* egal */
      }
      return neu;
    });
  };

  const { data: definitionen = [] } = useCycleDefinitions();
  const { data: buildings = [], isLoading } = useCycleBuildings();

  const { data: tasks = [] } = useQuery({
    queryKey: ["dashboard-jz-tasks-alle"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("annual_cycle_tasks")
        .select("building_id, task_key, status, completed_at, note, fiscal_year_start")
        // nur die Jahre, die der Umschalter überhaupt zeigen kann
        .gte("fiscal_year_start", `${new Date().getFullYear() - 3}-01-01`)
        .limit(5000);
      if (error) throw error;
      return (data || []) as TaskRow[];
    },
    staleTime: 60_000,
  });

  // Die Schritte: aus der Datenbank, sonst die feste Liste
  const schrittListe = useMemo(
    () =>
      definitionen.length > 0
        ? definitionen.map((d) => ({ key: d.task_key, label: d.label }))
        : ANNUAL_CYCLE_TASKS.map((t) => ({ key: t.key, label: t.label })),
    [definitionen],
  );
  const TOTAL = schrittListe.length;

  const taskMap = useMemo(() => {
    const map = new Map<string, TaskRow>();
    tasks.forEach((t) => map.set(`${t.building_id}:${t.fiscal_year_start}:${t.task_key}`, t));
    return map;
  }, [tasks]);

  /** Gebäude nach Wirtschaftsjahr-Variante gruppiert, Kalenderjahr zuerst. */
  const bloecke = useMemo(() => {
    const map = new Map<string, CycleBuilding[]>();
    buildings.forEach((b) => {
      const k = `${b.startMonth}-${b.startDay}`;
      map.set(k, [...(map.get(k) || []), b]);
    });
    return Array.from(map.entries())
      .map(([key, haeuser]) => {
        const [m, t] = key.split("-").map(Number);
        const jahre = buildFiscalYears(new Date().getFullYear(), { startMonth: m, startDay: t });
        return { key, startMonth: m, name: variantenName(m, t), haeuser, jahre, laufend: laufenderIndex(jahre) };
      })
      .sort((a, b) => a.startMonth - b.startMonth || a.key.localeCompare(b.key));
  }, [buildings]);

  return (
    <section aria-labelledby="h-zyklus" className="rounded-xl border bg-card px-5 pt-4 pb-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="h-zyklus" className="text-base font-semibold">Jahreszyklus</h2>
          <p className="text-sm text-muted-foreground">
            {TOTAL} Schritte je WEG · mit der Maus über ein Feld fahren für Details
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
      ) : bloecke.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine WEGs vorhanden.</p>
      ) : (
        <div className="max-h-[560px] overflow-y-auto flex flex-col gap-4 -mx-1 px-1">
          {bloecke.map((block) => {
            const abstand = Math.max(-1, Math.min(1, wahl[block.key] ?? 0));
            const fy = block.jahre[block.laufend + abstand] ?? block.jahre[block.laufend];
            const stand = fortschritt(fy);
            const zeilen = block.haeuser.map((h) => {
              const schritte = schrittListe.map((s, i) => {
                const row = taskMap.get(`${h.id}:${fy.start}:${s.key}`);
                return {
                  key: s.key,
                  nr: i + 1,
                  label: s.label,
                  status: (row?.status ?? "open") as AnnualCycleStatus,
                  completedAt: row?.completed_at ?? null,
                  note: row?.note ?? null,
                };
              });
              const erledigt = schritte.filter((s) => s.status === "done").length;
              const naechster = schritte.find((s) => s.status !== "done") ?? null;
              return { ...h, schritte, erledigt, naechster };
            });

            return (
              <div key={block.key} className="rounded-lg border border-border/70">
                {/* Kopf des Blocks: Variante · Jahresumschalter · Jahresfortschritt */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border/70 bg-muted/30 px-3 py-2.5 rounded-t-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{block.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(fy.start, "dd.MM.yyyy")} – {fmt(fy.end, "dd.MM.yyyy")} · {block.haeuser.length}{" "}
                      {block.haeuser.length === 1 ? "WEG" : "WEGs"}
                    </p>
                  </div>

                  <div className="inline-flex rounded-lg bg-muted p-1" role="group" aria-label={`Wirtschaftsjahr für ${block.name}`}>
                    {[-1, 0, 1].map((d) => {
                      const j = block.jahre[block.laufend + d];
                      if (!j) return null;
                      return (
                        <button
                          key={j.start}
                          type="button"
                          onClick={() => waehle(block.key, d)}
                          aria-pressed={abstand === d}
                          className={cn(
                            "whitespace-nowrap rounded-md px-2.5 py-1 text-xs transition-colors",
                            abstand === d
                              ? "bg-background font-semibold text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          WJ {j.label}
                        </button>
                      );
                    })}
                  </div>

                  <JahresFortschritt startMonth={block.startMonth} stand={stand} start={fy.start} />
                </div>

                <div className="px-1 py-1">
                  {zeilen.map((z) => (
                    <div
                      key={z.id}
                      className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)_52px_minmax(0,240px)] items-center gap-x-4 gap-y-1.5 px-2 py-2 border-t first:border-t-0 border-border/60 rounded-lg hover:bg-muted/40"
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
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** 12 Monatsfelder ab Beginn des Wirtschaftsjahres; der laufende Monat ist markiert. */
function JahresFortschritt({ startMonth, stand, start }: { startMonth: number; stand: Fortschritt; start: string }) {
  const aktuell = stand.art === "laeuft" ? stand.monat : stand.art === "vorbei" ? 12 : 0;
  const text =
    stand.art === "laeuft"
      ? `Monat ${stand.monat} von 12`
      : stand.art === "vorbei"
        ? "Abgeschlossen"
        : `Beginnt am ${fmt(start, "dd.MM.yyyy")}`;

  return (
    <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-3 sm:flex-none">
      <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">{text}</span>
      <div className="flex flex-1 gap-[2px] sm:w-[216px] sm:flex-none" aria-label={text}>
        {Array.from({ length: 12 }, (_, i) => {
          const monatIndex = (startMonth - 1 + i) % 12;
          const nr = i + 1;
          const jetzt = stand.art === "laeuft" && nr === stand.monat;
          return (
            <span key={i} className="flex flex-1 flex-col items-center gap-0.5" title={`${MONAT[monatIndex]} · Monat ${nr} von 12`}>
              <span
                className={cn(
                  "h-1.5 w-full rounded-full",
                  jetzt ? "bg-primary" : nr <= aktuell ? "bg-foreground/40" : "bg-muted-foreground/15",
                )}
              />
              <span className={cn("text-[9px] leading-none", jetzt ? "font-bold text-primary" : "text-muted-foreground")}>
                {MONAT_KURZ[monatIndex].charAt(0)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
