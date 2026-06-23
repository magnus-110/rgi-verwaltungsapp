import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle, Briefcase, TrendingUp, Mail, Phone, Plus,
  Users, Wrench, ChevronRight, Newspaper, ListTodo, Send,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CreateCaseDialog } from "@/components/cases/CreateCaseDialog";
import { TodoDialog } from "@/components/todos/TodoDialog";
import { BuildingGeneralInfoCard } from "./BuildingGeneralInfoCard";
import { AnnualCycleTimeline } from "./AnnualCycleTimeline";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { useNavigate } from "react-router-dom";
import { toTelHref } from "@/lib/phone";

type ManagementMode = "weg" | "rent";

interface OverviewData {
  open_reports_count: number;
  open_cases_count: number;
  booking_progress: {
    period_label: string;
    period_from: string;
    period_to: string;
    total: number;
    done: number;
    percent: number;
  };
  top_reports: Array<{ id: string; title: string; description?: string; priority: string; created_at: string; contact_name?: string }>;
  top_cases: Array<{ id: string; title: string; priority: string; status: string; category: string; created_at: string; unit_number?: string }>;
  owners: Array<{ assignment_id: string; contact_id: string; unit_number?: string; name: string; email?: string; phone?: string }>;
  providers: Array<{ assignment_id: string; contact_id: string; name: string; service_category?: string; email?: string; phone?: string }>;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500 text-white",
  normal: "bg-secondary text-secondary-foreground",
  medium: "bg-secondary text-secondary-foreground",
  low: "bg-muted text-muted-foreground",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Dringend", high: "Hoch", normal: "Normal", medium: "Normal", low: "Niedrig",
};

interface Props {
  buildingId: string;
  buildingName: string;
  managementMode: ManagementMode;
  onJumpTab: (tab: string) => void;
}

export const BuildingOverviewTab = ({ buildingId, buildingName, managementMode, onJumpTab }: Props) => {
  const navigate = useNavigate();
  const { openCompose } = useComposeEmail();
  const [createCaseOpen, setCreateCaseOpen] = useState(false);
  const [createTodoOpen, setCreateTodoOpen] = useState(false);
  const [showAllOwners, setShowAllOwners] = useState(false);
  const [showAllProviders, setShowAllProviders] = useState(false);

  const { data, isLoading } = useQuery<OverviewData>({
    queryKey: ["building-overview", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_building_overview", { p_building_id: buildingId });
      if (error) throw error;
      return data as unknown as OverviewData;
    },
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground p-4">Lade Übersicht…</div>;
  }

  // bp removed: Buchungsfortschritt durch Jahreszyklus ersetzt
  const ownersToShow = showAllOwners ? data.owners : data.owners.slice(0, 5);
  const providersToShow = showAllProviders ? data.providers : data.providers.slice(0, 5);

  const sendMailToAllOwners = () => {
    const emails = data.owners.map(o => o.email).filter(Boolean) as string[];
    if (emails.length === 0) return;
    openCompose({
      prefill: {
        bcc: emails.join(", "),
        subject: `Information zu ${buildingName}`,
        bodyText: "",
      },
    });
  };

  const sendMailToOwner = (email?: string, name?: string) => {
    if (!email) return;
    openCompose({
      prefill: {
        to: email,
        subject: `Nachricht aus ${buildingName}`,
        bodyText: name ? `Sehr geehrte/r ${name},\n\n` : "",
      },
    });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* KPI-Bar */}
      <div className="grid grid-cols-2 gap-2 md:gap-3">
        <KpiCard
          icon={AlertCircle}
          label="Offene Meldungen"
          value={data.open_reports_count}
          tone={data.open_reports_count > 0 ? "danger" : "neutral"}
          onClick={() => onJumpTab("reports")}
        />
        <KpiCard
          icon={Briefcase}
          label="Offene Vorgänge"
          value={data.open_cases_count}
          tone={data.open_cases_count > 0 ? "warning" : "neutral"}
          onClick={() => onJumpTab("cases")}
        />
      </div>

      {/* Jahreszyklus Timeline (nur WEG) */}
      {managementMode === "weg" && (
        <AnnualCycleTimeline buildingId={buildingId} />
      )}

      {/* Allgemeine Infos direkt unter Jahreszyklus */}
      <BuildingGeneralInfoCard buildingId={buildingId} managementMode={managementMode} />

      {/* 2 Spalten Grid (Vorgänge + Meldungen) */}
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        {/* Offene Vorgänge */}
        <Card>
          <CardHeader className="p-3 md:p-4 pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              Offene Vorgänge
            </CardTitle>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setCreateCaseOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Neu
            </Button>
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-1 space-y-2">
            {data.top_cases.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Keine offenen Vorgänge 🎉</p>
            ) : (
              data.top_cases.map(c => (
                <div
                  key={c.id}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                  onClick={() => onJumpTab("cases")}
                >
                  <Badge className={cn("text-[10px] px-1.5 py-0 mt-0.5", PRIORITY_COLORS[c.priority] || PRIORITY_COLORS.normal)}>
                    {PRIORITY_LABEL[c.priority] || c.priority}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.unit_number ? `EH ${c.unit_number} · ` : ""}
                      {formatDistanceToNow(new Date(c.created_at), { locale: de, addSuffix: true })}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              ))
            )}
            {data.open_cases_count > data.top_cases.length && (
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => onJumpTab("cases")}>
                Alle {data.open_cases_count} Vorgänge anzeigen
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Offene Meldungen */}
        <Card>
          <CardHeader className="p-3 md:p-4 pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm md:text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Offene Meldungen
            </CardTitle>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => onJumpTab("reports")}>
              Alle <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-1 space-y-2">
            {data.top_reports.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Keine offenen Meldungen 🎉</p>
            ) : (
              data.top_reports.map(r => (
                <div
                  key={r.id}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                  onClick={() => onJumpTab("reports")}
                >
                  <Badge className={cn("text-[10px] px-1.5 py-0 mt-0.5", PRIORITY_COLORS[r.priority] || PRIORITY_COLORS.normal)}>
                    {PRIORITY_LABEL[r.priority] || r.priority}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.contact_name ? `${r.contact_name} · ` : ""}
                      {formatDistanceToNow(new Date(r.created_at), { locale: de, addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Eigentümer (nur WEG) */}
      {managementMode === 'weg' && (
      <Card>
        <CardHeader className="p-3 md:p-4 pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm md:text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Eigentümer ({data.owners.length})
          </CardTitle>
          {data.owners.some(o => o.email) && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => onJumpTab("communication")}>
              <Send className="h-3.5 w-3.5 mr-1" /> Rundmail
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-3 md:p-4 pt-1 space-y-1">
          {data.owners.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Keine Eigentümer zugeordnet.</p>
          ) : (
            <>
              {ownersToShow.map(o => (
                <div key={o.assignment_id} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{o.name}</p>
                    {o.unit_number && (
                      <p className="text-[11px] text-muted-foreground">EH {o.unit_number}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {o.email && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" title={o.email}
                        onClick={() => sendMailToOwner(o.email, o.name)}>
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
                    {o.phone && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" title={o.phone} asChild>
                        <a href={toTelHref(o.phone) || undefined}><Phone className="h-4 w-4" /></a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {data.owners.length > 5 && (
                <Button variant="ghost" size="sm" className="w-full text-xs mt-1"
                  onClick={() => setShowAllOwners(v => !v)}>
                  {showAllOwners ? "Weniger anzeigen" : `Alle ${data.owners.length} anzeigen`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* Dienstleister */}
      <Card>
        <CardHeader className="p-3 md:p-4 pb-2">
          <CardTitle className="text-sm md:text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            Handwerker & Dienstleister ({data.providers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 md:p-4 pt-1 space-y-1">
          {data.providers.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Keine Dienstleister zugeordnet.</p>
          ) : (
            <>
              {providersToShow.map(p => (
                <div key={p.assignment_id} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.service_category && (
                      <p className="text-[11px] text-muted-foreground">{p.service_category}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {p.email && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" title={p.email}
                        onClick={() => sendMailToOwner(p.email, p.name)}>
                        <Mail className="h-4 w-4" />
                      </Button>
                    )}
                    {p.phone && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" title={p.phone} asChild>
                        <a href={toTelHref(p.phone) || undefined}><Phone className="h-4 w-4" /></a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {data.providers.length > 5 && (
                <Button variant="ghost" size="sm" className="w-full text-xs mt-1"
                  onClick={() => setShowAllProviders(v => !v)}>
                  {showAllProviders ? "Weniger anzeigen" : `Alle ${data.providers.length} anzeigen`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>


      {/* Quick Actions */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => setCreateCaseOpen(true)}>
              <Briefcase className="h-5 w-5" />
              <span className="text-xs">Vorgang</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => setCreateTodoOpen(true)}>
              <ListTodo className="h-5 w-5" />
              <span className="text-xs">Aufgabe</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => onJumpTab("forum")}>
              <Newspaper className="h-5 w-5" />
              <span className="text-xs">Aushang</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col gap-1"
              onClick={() => onJumpTab("communication")}>
              <Send className="h-5 w-5" />
              <span className="text-xs">Rundmail</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateCaseDialog
        open={createCaseOpen}
        onOpenChange={setCreateCaseOpen}
        buildingId={buildingId}
        managementMode={managementMode}
      />
      {createTodoOpen && (
        <TodoDialog
          open={createTodoOpen}
          onOpenChange={setCreateTodoOpen}
          mode="create"
        />
      )}
    </div>
  );
};

function KpiCard({
  icon: Icon, label, value, tone, onClick, className,
}: {
  icon: any; label: string; value: number | string;
  tone: "neutral" | "danger" | "warning" | "success";
  onClick?: () => void; className?: string;
}) {
  const toneStyles = {
    neutral: "bg-secondary/50 text-foreground",
    danger: "bg-destructive/10 text-destructive border-destructive/30",
    warning: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  }[tone];

  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 md:p-4 text-left transition-all hover:scale-[1.02] hover:shadow-md flex items-center gap-3",
        toneStyles,
        className
      )}
    >
      <div className="p-1.5 md:p-2 rounded-md bg-background/60 flex-shrink-0">
        <Icon className="h-4 w-4 md:h-5 md:w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg md:text-2xl font-bold leading-tight">{value}</p>
        <p className="text-[10px] md:text-xs opacity-80 truncate">{label}</p>
      </div>
    </button>
  );
}
