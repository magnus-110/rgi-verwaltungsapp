// Startseite: „Fällig“ — Aufgaben und Einladungsfristen zur Eigentümerversammlung
// in einer Liste, sortiert nach Dringlichkeit.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { addDays, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { EINLADUNGSFRIST_TAGE, TONE_CLASSES, fmt, relativTag } from "./dashboardDates";

interface TaskItem {
  id: string;
  title: string;
  priority?: string;
  due_date: string;
}

interface Props {
  todayTasks: TaskItem[];
  weekTasks: TaskItem[];
  isLoading: boolean;
}

type Eintrag = {
  key: string;
  date: Date;
  kind: "aufgabe" | "frist";
  title: string;
  meta: string;
  href: string;
};

/** Wie weit im Voraus an eine Einladungsfrist erinnert wird. */
const VORLAUF_TAGE = 14;
const MAX_EINTRAEGE = 8;

export function DashboardDueList({ todayTasks, weekTasks, isLoading }: Props) {
  const navigate = useNavigate();

  // Versammlungen, zu denen noch keine Einladung verschickt wurde.
  const { data: fristen = [] } = useQuery({
    queryKey: ["dashboard-etv-einladungsfristen"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("etv_meetings")
        .select("id, meeting_date, status, invitation_sent_at, building:buildings(name)")
        .gte("meeting_date", new Date().toISOString())
        .is("invitation_sent_at", null)
        .not("status", "in", "(completed,cancelled)")
        .order("meeting_date", { ascending: true });
      if (error) throw error;
      return (data || []) as {
        id: string;
        meeting_date: string;
        building: { name: string } | null;
      }[];
    },
    staleTime: 5 * 60_000,
  });

  const eintraege = useMemo<Eintrag[]>(() => {
    const liste: Eintrag[] = [];
    const grenze = addDays(new Date(), VORLAUF_TAGE);

    for (const m of fristen) {
      const versammlung = new Date(m.meeting_date);
      const frist = subDays(versammlung, EINLADUNGSFRIST_TAGE);
      if (frist > grenze) continue;
      const objekt = m.building?.name ?? "Versammlung";
      liste.push({
        key: `frist-${m.id}`,
        date: frist,
        kind: "frist",
        title: "Einladung zur Eigentümerversammlung versenden",
        meta: `${objekt} · ETV am ${fmt(versammlung, "dd.MM.")} · 3-Wochen-Frist (§ 24 Abs. 4 S. 2 WEG)`,
        href: `/versammlungen?m=${m.id}`,
      });
    }

    for (const t of [...todayTasks, ...weekTasks]) {
      if (!t.due_date) continue;
      liste.push({
        key: `task-${t.id}`,
        date: new Date(t.due_date),
        kind: "aufgabe",
        title: t.title,
        meta: t.priority === "high" || t.priority === "urgent" ? "Aufgabe · hohe Priorität" : "Aufgabe",
        href: "/todos",
      });
    }

    return liste.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [fristen, todayTasks, weekTasks]);

  const sichtbar = eintraege.slice(0, MAX_EINTRAEGE);

  return (
    <section aria-labelledby="h-faellig" className="rounded-xl border bg-card flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 id="h-faellig" className="text-base font-semibold">Fällig</h2>
          <p className="text-sm text-muted-foreground">Aufgaben und Einladungsfristen der nächsten Tage</p>
        </div>
        <button type="button" onClick={() => navigate("/todos")} className="text-sm font-semibold text-primary hover:underline shrink-0">
          Alle Aufgaben
        </button>
      </div>

      {isLoading ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Laden…</p>
      ) : sichtbar.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Nichts fällig — alles erledigt.</p>
      ) : (
        <ul className="px-2 pb-2">
          {sichtbar.map((e) => {
            const rel = relativTag(e.date);
            return (
              <li key={e.key}>
                <button
                  type="button"
                  onClick={() => navigate(e.href)}
                  className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 border-t first:border-t-0 border-border/60 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className={cn("hidden sm:inline-flex h-6 items-center justify-center rounded-full px-2 text-xs font-semibold whitespace-nowrap", TONE_CLASSES[rel.tone])}>
                    {rel.text}
                  </span>
                  <span className="min-w-0 flex flex-col gap-1 sm:gap-0.5">
                    <span className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1 min-w-0">
                      <span className={cn("sm:hidden inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold", TONE_CLASSES[rel.tone])}>
                        {rel.text}
                      </span>
                      <span
                        className={cn(
                          "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold shrink-0",
                          e.kind === "frist"
                            ? "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {e.kind === "frist" ? "Einladungsfrist" : "Aufgabe"}
                      </span>
                      <span className="hidden sm:block truncate text-sm font-semibold">{e.title}</span>
                    </span>
                    <span className="sm:hidden text-sm font-semibold leading-snug">{e.title}</span>
                    <span className="text-[13px] text-muted-foreground sm:truncate">{e.meta}</span>
                  </span>
                  <span className="text-[13px] text-muted-foreground tabular-nums self-start sm:self-center">{fmt(e.date, "dd.MM.")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {eintraege.length > MAX_EINTRAEGE && (
        <p className="px-5 pb-4 text-xs text-muted-foreground">
          + {eintraege.length - MAX_EINTRAEGE} weitere
        </p>
      )}
    </section>
  );
}
