// Projekte — und damit auch die Stunden.
//
// Der eigene Menüpunkt „Stunden“ ist weg. Eine Stunde gehört immer zu
// einem Projekt; sie getrennt zu führen hieß, beim Erfassen erst den
// Bereich zu wechseln und dort das Projekt noch einmal zu suchen.
//
// Die Liste beantwortet eine Frage: wo liegt noch Geld? Deshalb ist
// sie nach offenen Stunden sortiert und nicht alphabetisch.

import { useMemo, useState } from "react";
import {
  useRgiProjects, useRgiClients, useRgiTimeEntries,
  type RgiProject, type RgiTimeEntry,
} from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, ChevronRight, FolderKanban, CalendarClock } from "lucide-react";
import { ProjectDialog } from "./ProjectDialog";
import { ProjectSheet } from "./ProjectSheet";
import { formatEuro, formatHours, formatDay, totalsFor } from "@/lib/rgiTime";

type Filter = "active" | "all" | "closed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "Läuft" },
  { key: "all", label: "Alle" },
  { key: "closed", label: "Abgeschlossen" },
];

const STATUS_LABEL: Record<string, string> = {
  active: "läuft", paused: "pausiert", closed: "abgeschlossen",
};

const SPARTE_LABEL: Record<string, string> = {
  weg: "WEG", rent: "Miete", sales: "Verkauf", letting: "Vermietung", other: "Sonstige",
};

export function ProjectsTab() {
  const { data: projects, isLoading } = useRgiProjects();
  const { data: clients } = useRgiClients();
  const { data: entries, isLoading: loadingTime } = useRgiTimeEntries();

  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RgiProject | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";

  // Einträge einmal nach Projekt sortieren, statt je Zeile zu filtern.
  const byProject = useMemo(() => {
    const map = new Map<string, RgiTimeEntry[]>();
    for (const e of entries ?? []) {
      const list = map.get(e.project_id);
      if (list) list.push(e);
      else map.set(e.project_id, [e]);
    }
    return map;
  }, [entries]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projects ?? [])
      .map((p) => ({ p, t: totalsFor(byProject.get(p.id) ?? [], p) }))
      .filter(({ p }) => (filter === "all" ? true : filter === "active" ? p.status !== "closed" : p.status === "closed"))
      .filter(({ p }) =>
        !q || p.name.toLowerCase().includes(q) || clientName(p.client_id).toLowerCase().includes(q))
      .sort((a, b) => b.t.openMinutes - a.t.openMinutes || a.p.name.localeCompare(b.p.name));
  }, [projects, byProject, filter, search, clients]);

  // Kacheln zeigen das Gesamtbild über alle Projekte, nicht über die
  // gerade gefilterte Liste — sonst wandert die Zahl beim Suchen.
  const overview = useMemo(() => {
    const all = totalsFor(entries ?? [], null);
    let openMinutes = 0, openValue = 0, billedMinutes = 0, monthMinutes = 0;
    const month = new Date().toISOString().slice(0, 7);
    for (const e of entries ?? []) {
      const p = projects?.find((x) => x.id === e.project_id) ?? null;
      const t = totalsFor([e], p);
      openMinutes += t.openMinutes;
      openValue += t.openValue;
      billedMinutes += t.billedMinutes;
      if (e.date?.startsWith(month)) monthMinutes += e.minutes;
    }
    const running = (projects ?? []).filter((p) => p.status !== "closed").length;
    const objects = new Set((projects ?? []).map((p) => p.client_id)).size;
    return {
      openMinutes, openValue: Math.round(openValue * 100) / 100, billedMinutes, monthMinutes,
      running, objects, lastDay: all.lastDay,
    };
  }, [entries, projects]);

  const openProject = projects?.find((p) => p.id === openId) ?? null;

  return (
    <div className="space-y-4 mt-4">
      {/* Gesamtbild */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          accent
          label="Offen"
          value={formatHours(overview.openMinutes)}
          unit="Std"
          foot={`${formatEuro(overview.openValue)} noch nicht abgerechnet`}
        />
        <Tile
          label="Projekte"
          value={String(overview.running)}
          unit={overview.running === 1 ? "läuft" : "laufen"}
          foot={`bei ${overview.objects} ${overview.objects === 1 ? "Kunden" : "Kunden"}`}
        />
        <Tile
          label="Diesen Monat"
          value={formatHours(overview.monthMinutes)}
          unit="Std"
          foot={overview.lastDay ? `zuletzt am ${formatDay(overview.lastDay)}` : "noch nichts erfasst"}
        />
        <Tile
          label="Abgerechnet"
          value={formatHours(overview.billedMinutes)}
          unit="Std"
          foot={overview.billedMinutes > 0 ? "bereits berechnet" : "bisher keine Stunde berechnet"}
        />
      </div>

      {/* Suche und Filter */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Projekt, Objekt oder Kunde suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            type="button"
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            aria-pressed={filter === f.key}
            className="rounded-full"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <Button className="gap-1.5 ml-auto" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4" />Neues Projekt
        </Button>
      </div>

      {isLoading || loadingTime ? (
        <Skeleton className="h-72" />
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          <FolderKanban className="w-9 h-9 mx-auto mb-3 opacity-25" />
          {(projects ?? []).length === 0
            ? "Noch keine Projekte. Über „Neues Projekt“ das erste anlegen."
            : "Kein Projekt passt zur Suche."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/40">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nach offenen Stunden
            </span>
            <span className="text-xs text-muted-foreground">· {rows.length}</span>
            <span className="text-xs text-muted-foreground ml-auto">Klick öffnet das Projekt</span>
          </div>
          {rows.map(({ p, t }) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(p.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(p.id); } }}
              className="px-4 py-3 flex items-center gap-3 border-t first:border-t-0 cursor-pointer hover:bg-muted/40"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5">
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${p.status === "active" ? "bg-emerald-600" : "bg-muted-foreground"}`} />
                    {STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                  <span>{clientName(p.client_id)}</span>
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                    {SPARTE_LABEL[p.sparte] ?? p.sparte}
                  </Badge>
                  {t.undatedCount > 0 && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal gap-1 border-primary/40 text-primary">
                      <CalendarClock className="w-3 h-3" />
                      {t.undatedCount}× Datum fehlt
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-right whitespace-nowrap">
                {t.openMinutes > 0 ? (
                  <>
                    <div className="text-sm font-semibold tabular-nums">{formatHours(t.openMinutes)} Std</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {formatEuro(t.openValue)} offen
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-muted-foreground">—</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.entries > 0 ? "alles abgerechnet" : "noch keine Stunden"}
                    </div>
                  </>
                )}
                {t.lastDay && (
                  <div className="text-[11px] text-muted-foreground">zuletzt {formatDay(t.lastDay)}</div>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          ))}
        </Card>
      )}

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editing}
        clients={clients ?? []}
        onCreated={(id) => setOpenId(id)}
      />

      <ProjectSheet
        open={!!openProject}
        onOpenChange={(v) => !v && setOpenId(null)}
        project={openProject}
        clientName={openProject ? clientName(openProject.client_id) : ""}
        onEdit={() => { setEditing(openProject); setDialogOpen(true); }}
      />
    </div>
  );
}

function Tile({ label, value, unit, foot, accent }: {
  label: string; value: string; unit?: string; foot: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-primary/40 bg-primary/5" : ""}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`block text-2xl font-semibold tabular-nums mt-0.5 ${accent ? "text-primary" : ""}`}>
        {value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1.5">{unit}</span>}
      </span>
      <span className="block text-xs text-muted-foreground tabular-nums">{foot}</span>
    </div>
  );
}
