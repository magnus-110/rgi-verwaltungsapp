// Startseite: „Anstehende Termine“ — Kalendereinträge und Eigentümerversammlungen
// der nächsten vier Wochen.

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { fmt } from "./dashboardDates";

type Termin = {
  key: string;
  start: Date;
  allDay: boolean;
  title: string;
  ort: string | null;
  etv: boolean;
  href: string;
};

const TAGE = 28;
const MAX_TERMINE = 6;

export function DashboardAppointments() {
  const navigate = useNavigate();

  const { data: termine = [], isLoading } = useQuery({
    queryKey: ["dashboard-anstehende-termine"],
    queryFn: async () => {
      const von = new Date();
      const bis = addDays(von, TAGE);
      const db = supabase as any;
      const [kal, etv] = await Promise.all([
        db
          .from("calendar_events")
          .select("id, title, start_datetime, is_all_day")
          .gte("start_datetime", von.toISOString())
          .lte("start_datetime", bis.toISOString())
          .order("start_datetime", { ascending: true })
          .limit(20),
        db
          .from("etv_meetings")
          .select("id, title, meeting_date, location, status, building:buildings(name)")
          .gte("meeting_date", von.toISOString())
          .lte("meeting_date", bis.toISOString())
          .not("status", "in", "(completed,cancelled)")
          .order("meeting_date", { ascending: true }),
      ]);
      const liste: Termin[] = [];
      for (const e of (kal.data || []) as any[]) {
        liste.push({
          key: `cal-${e.id}`,
          start: new Date(e.start_datetime),
          allDay: !!e.is_all_day,
          title: e.title || "Termin",
          ort: null,
          etv: false,
          href: "/calendar",
        });
      }
      for (const m of (etv.data || []) as any[]) {
        liste.push({
          key: `etv-${m.id}`,
          start: new Date(m.meeting_date),
          allDay: false,
          title: "Eigentümerversammlung",
          ort: [m.building?.name, m.location].filter(Boolean).join(" · ") || null,
          etv: true,
          href: `/versammlungen?m=${m.id}`,
        });
      }
      return liste.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, MAX_TERMINE);
    },
    staleTime: 5 * 60_000,
  });

  return (
    <section aria-labelledby="h-termine" className="rounded-xl border bg-card flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 id="h-termine" className="text-base font-semibold">Anstehende Termine</h2>
          <p className="text-sm text-muted-foreground">Nächste 4 Wochen</p>
        </div>
        <button type="button" onClick={() => navigate("/calendar")} className="text-sm font-semibold text-primary hover:underline shrink-0">
          Kalender
        </button>
      </div>

      {isLoading ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Laden…</p>
      ) : termine.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Keine Termine in den nächsten 4 Wochen.</p>
      ) : (
        <ul className="px-2 pb-2">
          {termine.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => navigate(t.href)}
                className="w-full text-left grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3.5 px-3 py-2.5 border-t first:border-t-0 border-border/60 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <span
                  className={cn(
                    "flex h-[52px] w-[52px] flex-col items-center justify-center rounded-lg",
                    t.etv ? "bg-primary/10 text-orange-800 dark:text-orange-300" : "bg-muted text-foreground",
                  )}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide">{fmt(t.start, "MMM").replace(".", "")}</span>
                  <span className="text-xl font-bold leading-tight tabular-nums">{fmt(t.start, "dd")}</span>
                </span>
                <span className="min-w-0 flex flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{t.title}</span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {fmt(t.start, "EE")}
                    {" · "}
                    {t.allDay ? "ganztägig" : fmt(t.start, "HH:mm")}
                    {t.ort ? ` · ${t.ort}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
