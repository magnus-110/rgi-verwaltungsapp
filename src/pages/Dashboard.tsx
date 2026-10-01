import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { TimeClockButton } from "@/components/timeclock/TimeClockButton";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { DashboardDueList } from "@/components/dashboard/DashboardDueList";
import { DashboardAppointments } from "@/components/dashboard/DashboardAppointments";
import { DashboardAnnualCycle } from "@/components/dashboard/DashboardAnnualCycle";

/**
 * Startseite der Verwaltung.
 *
 * Aufbau: Begrüßung · vier Kennzahlen (Meldungen, Rechnungen, E-Mails,
 * Schlüssel) · „Fällig“ (Aufgaben + Einladungsfristen) · „Anstehende Termine“ ·
 * Jahreszyklus aller WEGs.
 */

interface TaskItem { id: string; title: string; priority: string; due_date: string; status: string; is_overdue?: boolean }

interface GlobalStats {
  open_reports: number;
  open_cases: number;
  open_invoices: number;
  unread_emails: number;
  building_count: number;
  today_tasks: TaskItem[];
  week_tasks: TaskItem[];
}

type Tone = "red" | "orange" | "blue" | "neutral";

const DOT: Record<Tone, string> = {
  red: "bg-red-600",
  orange: "bg-primary",
  blue: "bg-sky-600",
  neutral: "bg-muted-foreground/50",
};

const KpiCard = ({
  label, value, sub, subWarn, tone, onClick, isLoading,
}: {
  label: string;
  value: number;
  sub?: string;
  subWarn?: boolean;
  tone: Tone;
  onClick: () => void;
  isLoading: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left flex flex-col gap-2.5 rounded-xl border bg-card px-5 py-4 transition-all hover:shadow-md hover:border-primary/40"
  >
    <span className="flex items-center justify-between gap-2">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      <span className={cn("h-2 w-2 rounded-full", value > 0 ? DOT[tone] : "bg-muted-foreground/25")} />
    </span>
    <span className="text-[32px] font-bold leading-none tracking-tight tabular-nums">
      {isLoading ? "…" : value}
    </span>
    <span className={cn("text-[13px] font-medium", subWarn ? "text-orange-800 dark:text-orange-300" : "text-muted-foreground")}>
      {sub ?? "Anzeigen"}
    </span>
  </button>
);

const begruessung = () => {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
};

export const Dashboard = () => {
  const { managementMode } = useManagementMode();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-global-stats", user?.id, managementMode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_global_stats" as any, {
        p_management_mode: managementMode,
      });
      if (error) throw error;
      return data as unknown as GlobalStats;
    },
    enabled: !!user?.id,
    refetchInterval: 60_000,
  });

  // Admin: Gebäude und Einheiten je Verwaltungsart
  const { data: portfolio } = useQuery({
    queryKey: ["dashboard-portfolio-totals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("unit_count, management_mode");
      if (error) throw error;
      const init = { weg: { buildings: 0, units: 0 }, rent: { buildings: 0, units: 0 } };
      return (data || []).reduce((acc, b: any) => {
        const key = b.management_mode === "weg" ? "weg" : "rent";
        acc[key].buildings += 1;
        acc[key].units += b.unit_count || 0;
        return acc;
      }, init);
    },
    enabled: isAdmin && !!user?.id,
    staleTime: 5 * 60_000,
  });

  // Ausgegebene Schlüssel (noch nicht zurück) und davon überfällige
  const { data: schluessel } = useQuery({
    queryKey: ["dashboard-key-loans"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("key_loans")
        .select("id, due_at")
        .is("returned_at", null);
      if (error) throw error;
      const jetzt = Date.now();
      const rows = (data || []) as { due_at: string | null }[];
      return {
        offen: rows.length,
        ueberfaellig: rows.filter((r) => r.due_at && new Date(r.due_at).getTime() < jetzt).length,
      };
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const stats: GlobalStats = data || {
    open_reports: 0, open_cases: 0, open_invoices: 0, unread_emails: 0,
    building_count: 0, today_tasks: [], week_tasks: [],
  };

  const gebaeude = isAdmin && portfolio
    ? (managementMode === "weg" ? portfolio.weg.buildings : portfolio.rent.buildings)
    : stats.building_count;
  const einheiten = isAdmin && portfolio
    ? (managementMode === "weg" ? portfolio.weg.units : portfolio.rent.units)
    : null;

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5 md:space-y-6">
      {/* Kopf */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-muted-foreground">
            {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
          </p>
          <h1 className="text-2xl md:text-[28px] font-bold tracking-tight">
            {begruessung()}{profile?.first_name ? `, ${profile.first_name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {managementMode === "weg" ? "WEG-Verwaltung" : "Mietverwaltung"}
            {" · "}
            <span className="font-semibold text-foreground">{gebaeude}</span> {gebaeude === 1 ? "Objekt" : "Objekte"}
            {einheiten !== null && (
              <>
                {" · "}
                <span className="font-semibold text-foreground">{einheiten}</span> Einheiten
              </>
            )}
          </p>
        </div>
        <TimeClockButton />
      </header>

      {/* Kennzahlen */}
      <section aria-label="Kennzahlen" className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="Offene Meldungen"
          value={stats.open_reports}
          tone="red"
          onClick={() => navigate("/reports")}
          isLoading={isLoading}
        />
        <KpiCard
          label="Offene Rechnungen"
          value={stats.open_invoices}
          tone="orange"
          onClick={() => navigate("/zahlungen")}
          isLoading={isLoading}
        />
        <KpiCard
          label="Neue E-Mails"
          value={stats.unread_emails}
          tone="blue"
          onClick={() => navigate("/postfach")}
          isLoading={isLoading}
        />
        <KpiCard
          label="Schlüssel ausgegeben"
          value={schluessel?.offen ?? 0}
          sub={
            schluessel?.ueberfaellig
              ? `${schluessel.ueberfaellig} Rückgabe${schluessel.ueberfaellig === 1 ? "" : "n"} überfällig`
              : undefined
          }
          subWarn={!!schluessel?.ueberfaellig}
          tone="neutral"
          onClick={() => navigate("/schluessel")}
          isLoading={!schluessel}
        />
      </section>

      {/* Fällig + Termine */}
      <div className="grid gap-4 md:gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DashboardDueList
          todayTasks={stats.today_tasks || []}
          weekTasks={stats.week_tasks || []}
          isLoading={isLoading}
        />
        <DashboardAppointments />
      </div>

      {/* Jahreszyklus (nur WEG) */}
      {managementMode === "weg" && <DashboardAnnualCycle />}
    </div>
  );
};
