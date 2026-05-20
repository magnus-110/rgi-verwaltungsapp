import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, Briefcase, FileText, Mail, ListTodo, Wrench,
  ChevronRight, Building2, Activity, CalendarClock, Home,
} from "lucide-react";
import { formatDistanceToNow, format, isValid } from "date-fns";
import { de } from "date-fns/locale";

const safeFormat = (value: any, fmt: string) => {
  if (!value) return "—";
  const d = new Date(value);
  return isValid(d) ? format(d, fmt, { locale: de }) : "—";
};
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { AnnualCycleDashboardWidget } from "@/components/dashboard/AnnualCycleDashboardWidget";

interface TaskItem { id: string; title: string; priority: string; due_date: string; status: string; is_overdue?: boolean }
interface MaintenanceItem { id: string; building_id: string; building_name: string; task_name: string; next_due_date: string; category: string; is_overdue?: boolean }

interface GlobalStats {
  open_reports: number;
  open_cases: number;
  open_invoices: number;
  unread_emails: number;
  building_count: number;
  today_tasks: TaskItem[];
  week_tasks: TaskItem[];
  today_maintenance: MaintenanceItem[];
  week_maintenance: MaintenanceItem[];
  upcoming_maintenance: MaintenanceItem[];
  recent_activity: Array<{ kind: string; id: string; label: string; ts: string; building_id: string; building_name: string; extra?: string }>;
  buildings_summary: Array<{ id: string; name: string; address: string; unit_count: number; open_count: number }>;
}

const KpiCard = ({
  label, value, icon: Icon, tone, onClick, isLoading,
}: {
  label: string; value: number; icon: any;
  tone: "destructive" | "warning" | "info" | "neutral";
  onClick: () => void; isLoading: boolean;
}) => {
  const toneClasses = {
    destructive: "border-destructive/30 bg-destructive/5 hover:bg-destructive/10",
    warning: "border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10",
    info: "border-primary/30 bg-primary/5 hover:bg-primary/10",
    neutral: "border-border bg-card hover:bg-muted/50",
  };
  const iconColor = {
    destructive: "text-destructive",
    warning: "text-orange-500",
    info: "text-primary",
    neutral: "text-muted-foreground",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border p-4 md:p-5 transition-all hover:shadow-md",
        toneClasses[tone]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs md:text-sm text-muted-foreground font-medium truncate">{label}</p>
          <p className="text-2xl md:text-3xl font-bold mt-1 tabular-nums">
            {isLoading ? "…" : value}
          </p>
        </div>
        <Icon className={cn("h-5 w-5 md:h-6 md:w-6 flex-shrink-0", iconColor[tone])} />
      </div>
      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
        <span>Anzeigen</span>
        <ChevronRight className="h-3 w-3" />
      </div>
    </button>
  );
};

export const Dashboard = () => {
  const { managementMode } = useManagementMode();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-global-stats", managementMode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_global_stats" as any, {
        p_management_mode: managementMode,
      });
      if (error) throw error;
      return data as unknown as GlobalStats;
    },
    refetchInterval: 60_000,
  });

  // Admin-only: portfolio totals (buildings + units) per management mode
  const { data: portfolio } = useQuery({
    queryKey: ["dashboard-portfolio-totals"],
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
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });

  const stats: GlobalStats = data || {
    open_reports: 0, open_cases: 0, open_invoices: 0, unread_emails: 0,
    building_count: 0,
    today_tasks: [], week_tasks: [],
    today_maintenance: [], week_maintenance: [],
    upcoming_maintenance: [],
    recent_activity: [], buildings_summary: [],
  };

  const topProblemBuildings = useMemo(
    () => (stats.buildings_summary || []).filter(b => b.open_count > 0).slice(0, 5),
    [stats.buildings_summary]
  );

  const activityIcon = (kind: string) => {
    switch (kind) {
      case "report": return AlertCircle;
      case "case": return Briefcase;
      case "email": return Mail;
      default: return Activity;
    }
  };

  const activityLabel = (kind: string) => {
    switch (kind) {
      case "report": return "Meldung";
      case "case": return "Vorgang";
      case "email": return "E-Mail";
      default: return "Ereignis";
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          {managementMode === "weg" ? "WEG-Verwaltung" : "Mietverwaltung"}
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Tagesübersicht über{" "}
          <span className="font-medium text-foreground">
            {isAdmin && portfolio
              ? (managementMode === "weg" ? portfolio.weg.buildings : portfolio.rent.buildings)
              : stats.building_count}
          </span>{" "}
          {((isAdmin && portfolio
            ? (managementMode === "weg" ? portfolio.weg.buildings : portfolio.rent.buildings)
            : stats.building_count) === 1) ? "Gebäude" : "Gebäude"}
          {isAdmin && portfolio && (
            <>
              {" "}·{" "}
              <span className="font-medium text-foreground">
                {(managementMode === "weg" ? portfolio.weg.units : portfolio.rent.units)}
              </span>{" "}
              {managementMode === "weg" ? "WEG-Einheiten" : "Miet-Einheiten"} verwaltet
            </>
          )}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="Offene Meldungen"
          value={stats.open_reports}
          icon={AlertCircle}
          tone={stats.open_reports > 0 ? "destructive" : "neutral"}
          onClick={() => navigate("/reports")}
          isLoading={isLoading}
        />
        <KpiCard
          label="Offene Vorgänge"
          value={stats.open_cases}
          icon={Briefcase}
          tone={stats.open_cases > 0 ? "warning" : "neutral"}
          onClick={() => navigate("/buildings")}
          isLoading={isLoading}
        />
        <KpiCard
          label="Offene Rechnungen"
          value={stats.open_invoices}
          icon={FileText}
          tone={stats.open_invoices > 0 ? "info" : "neutral"}
          onClick={() => navigate("/zahlungen")}
          isLoading={isLoading}
        />
        <KpiCard
          label="Neue E-Mails"
          value={stats.unread_emails}
          icon={Mail}
          tone={stats.unread_emails > 0 ? "info" : "neutral"}
          onClick={() => navigate("/postfach")}
          isLoading={isLoading}
        />
      </div>

      {/* Jahreszyklus aller WEGs (ausklappbar) */}
      <AnnualCycleDashboardWidget />

      <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Aufgaben */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base font-semibold">
              <span className="flex items-center">
                <ListTodo className="mr-2 h-5 w-5 text-primary" />
                Aufgaben
              </span>
              {stats.today_tasks.some(t => t.is_overdue) && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">überfällig</Badge>
              )}
            </CardTitle>
            <CardDescription>Heute & diese Woche</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Heute / Überfällig
              </p>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Laden…</p>
              ) : stats.today_tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine fälligen Aufgaben</p>
              ) : (
                <ul className="space-y-1.5">
                  {stats.today_tasks.slice(0, 5).map(t => (
                    <li
                      key={t.id}
                      className={cn(
                        "flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer",
                        t.is_overdue && "border-l-2 border-destructive bg-destructive/5"
                      )}
                      onClick={() => navigate("/todos")}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ListTodo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{t.title}</span>
                      </div>
                      <span className={cn(
                        "text-xs flex-shrink-0",
                        t.is_overdue ? "text-destructive font-medium" : "text-muted-foreground"
                      )}>
                        {format(new Date(t.due_date), "d. MMM", { locale: de })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="pt-2 border-t">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Diese Woche
              </p>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Laden…</p>
              ) : stats.week_tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Aufgaben in den nächsten 7 Tagen</p>
              ) : (
                <ul className="space-y-1.5">
                  {stats.week_tasks.slice(0, 5).map(t => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate("/todos")}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ListTodo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{t.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {format(new Date(t.due_date), "d. MMM", { locale: de })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Wartungen */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base font-semibold">
              <span className="flex items-center">
                <Wrench className="mr-2 h-5 w-5 text-primary" />
                Wartungen
              </span>
              {stats.today_maintenance.some(m => m.is_overdue) && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">überfällig</Badge>
              )}
            </CardTitle>
            <CardDescription>Heute & diese Woche</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Heute / Überfällig
              </p>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Laden…</p>
              ) : stats.today_maintenance.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine fälligen Wartungen</p>
              ) : (
                <ul className="space-y-1.5">
                  {stats.today_maintenance.slice(0, 5).map(m => (
                    <li
                      key={m.id}
                      className={cn(
                        "flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer",
                        m.is_overdue && "border-l-2 border-destructive bg-destructive/5"
                      )}
                      onClick={() => navigate(`/buildings/${m.building_id}`)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate">{m.task_name}</div>
                          <div className="text-xs text-muted-foreground truncate">{m.building_name}</div>
                        </div>
                      </div>
                      <span className={cn(
                        "text-xs flex-shrink-0",
                        m.is_overdue ? "text-destructive font-medium" : "text-muted-foreground"
                      )}>
                        {format(new Date(m.next_due_date), "d. MMM", { locale: de })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="pt-2 border-t">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Diese Woche
              </p>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Laden…</p>
              ) : stats.week_maintenance.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Wartungen in den nächsten 7 Tagen</p>
              ) : (
                <ul className="space-y-1.5">
                  {stats.week_maintenance.slice(0, 5).map(m => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/buildings/${m.building_id}`)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate">{m.task_name}</div>
                          <div className="text-xs text-muted-foreground truncate">{m.building_name}</div>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {format(new Date(m.next_due_date), "d. MMM", { locale: de })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Letzte Aktivität */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base font-semibold">
              <Activity className="mr-2 h-5 w-5 text-primary" />
              Letzte Aktivität
            </CardTitle>
            <CardDescription>Neue Meldungen und Vorgänge</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Laden…</p>
            ) : stats.recent_activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Aktivität</p>
            ) : (
              <ul className="space-y-2">
                {stats.recent_activity.slice(0, 8).map((a, idx) => {
                  const Icon = activityIcon(a.kind);
                  return (
                    <li
                      key={`${a.kind}-${a.id}-${idx}`}
                      className="flex items-start gap-2 text-sm py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => a.building_id && navigate(`/buildings/${a.building_id}`)}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {activityLabel(a.kind)}
                          </Badge>
                          <span className="truncate font-medium">{a.label}</span>
                        </div>
                        {a.building_name && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {a.building_name} · {formatDistanceToNow(new Date(a.ts), { addSuffix: true, locale: de })}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Buildings with open items */}
      {topProblemBuildings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base font-semibold">
              <Building2 className="mr-2 h-5 w-5 text-primary" />
              Gebäude mit offenen Punkten
            </CardTitle>
            <CardDescription>Direkt zum Gebäude springen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {topProblemBuildings.map(b => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/buildings/${b.id}`)}
                  className="text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{b.address}</div>
                  </div>
                  <Badge variant="destructive" className="flex-shrink-0">
                    {b.open_count}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
