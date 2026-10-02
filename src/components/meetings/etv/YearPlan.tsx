import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatMeetingDate, getNextStep, getPhase, meetingYear, phaseIndex, relativeDays, startOfDay,
  type NextStep,
} from "@/lib/etvPhase";
import { EtvCard, KpiTile, PhaseBars, Pill, StatusDot } from "./ui";
import type { EtvMeetingWithExtras, Topic, WegBuilding } from "./useEtvData";

interface Props {
  year: number;
  buildings: WegBuilding[]; // bereits gefiltert
  meetings: EtvMeetingWithExtras[]; // alle Jahre, bereits gefiltert
  topics: Topic[];
  onOpenMeeting: (id: string) => void;
  onCreateMeeting: (buildingId: string) => void;
}

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const PHASE_LABEL: Record<string, string> = {
  planung: "Planung", einladung: "Einladung", durchfuehrung: "Durchführung", protokoll: "Protokoll", abgeschlossen: "Abgeschlossen",
};

type Row = {
  key: string;
  building: WegBuilding;
  meeting: EtvMeetingWithExtras | null;
  step: NextStep;
  phase: string;
  done: number;
  late: boolean;
  topics: number;
  extra: boolean;
};

const isExtra = (m: { meeting_kind?: string | null } | null | undefined) => m?.meeting_kind === "ausserordentlich";

type GroupKey = NextStep["group"] | "ohne" | "ao";
const GROUPS: { key: GroupKey; title: string; short: string; dot: string }[] = [
  { key: "geplant", title: "Geplant", short: "Geplant", dot: "bg-slate-400" },
  { key: "handeln", title: "Handlungsbedarf", short: "Handlungsbedarf", dot: "bg-red-600" },
  { key: "protokoll", title: "Protokoll offen", short: "Protokoll offen", dot: "bg-primary" },
  { key: "ohne", title: "Noch offen – keine ordentliche Versammlung angelegt", short: "Noch offen", dot: "bg-amber-500" },
  { key: "ao", title: "Außerordentliche Versammlungen", short: "Außerordentlich", dot: "bg-violet-600" },
  { key: "erledigt", title: "Abgeschlossen", short: "Abgeschlossen", dot: "bg-emerald-600" },
];
const groupOf = (r: { meeting: unknown; step: NextStep; extra?: boolean }): GroupKey =>
  !r.meeting ? "ohne" : r.extra && r.step.group !== "erledigt" ? "ao" : r.step.group;

export const YearPlan = ({ year, buildings, meetings, topics, onOpenMeeting, onCreateMeeting }: Props) => {
  const [month, setMonth] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [groupFilter, setGroupFilter] = useState<GroupKey | null>(null);
  const [search, setSearch] = useState("");
  const now = new Date();
  const thisYear = now.getFullYear();

  const yearMeetings = useMemo(() => meetings.filter((m) => meetingYear(m) === year && m.status !== "cancelled"), [meetings, year]);

  const openTopicsByBuilding = useMemo(() => {
    const map = new Map<string, number>();
    topics.forEach((t) => {
      if (!t.buildingId) return;
      if (t.status === "neu" || t.status === "eingeplant" || t.status === "zurueckgestellt") map.set(t.buildingId, (map.get(t.buildingId) || 0) + 1);
    });
    return map;
  }, [topics]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const b of buildings) {
      const ms = yearMeetings.filter((m) => m.building_id === b.id);
      // Nur ordentliche Versammlungen erfüllen die Pflicht „mind. 1 pro Jahr“ (§ 24 Abs. 1 WEG)
      if (!ms.some((m) => !isExtra(m))) {
        out.push({
          key: `none-${b.id}`, building: b, meeting: null,
          step: year < thisYear
            ? { label: `Keine Versammlung in ${year}`, tag: "Fehlt", urgency: "amber", rank: 50, group: "handeln" }
            : { label: "Versammlung anlegen – mindestens eine pro Jahr (§ 24 Abs. 1 WEG)", tag: "Termin", urgency: "amber", rank: 50, group: "handeln" },
          phase: "–", done: 0, late: false, topics: openTopicsByBuilding.get(b.id) || 0, extra: false,
        });
      }
      for (const m of ms) {
        const step = getNextStep(m, m.extras);
        const phase = getPhase(m, m.extras);
        const idx = phaseIndex(phase);
        out.push({
          key: m.id, building: b, meeting: m, step, phase: PHASE_LABEL[phase],
          done: idx, late: step.urgency === "red" || (step.tag === "Status"),
          topics: openTopicsByBuilding.get(b.id) || 0,
          extra: isExtra(m),
        });
      }
    }
    return out;
  }, [buildings, yearMeetings, openTopicsByBuilding, year, thisYear]);

  const needle = search.trim().toLowerCase();
  const baseRows = rows
    .filter((r) => month === null || (r.meeting?.meeting_date && new Date(r.meeting.meeting_date).getMonth() === month))
    .filter((r) => !needle || [r.building.name, r.building.city, r.building.address, r.meeting?.title, r.meeting?.location]
      .some((v) => (v || "").toLowerCase().includes(needle)));
  const groupCounts = new Map<GroupKey, number>();
  baseRows.forEach((r) => groupCounts.set(groupOf(r), (groupCounts.get(groupOf(r)) || 0) + 1));
  const filteredRows = groupFilter ? baseRows.filter((r) => groupOf(r) === groupFilter) : baseRows;

  const grouped = GROUPS.map((g) => ({
    ...g,
    rows: filteredRows
      .filter((r) => groupOf(r) === g.key)
      .sort((a, b) => a.step.rank - b.step.rank || (a.meeting?.meeting_date || "").localeCompare(b.meeting?.meeting_date || "")),
  })).filter((g) => g.rows.length > 0);

  // Kennzahlen
  const held = yearMeetings.filter((m) => !isExtra(m) && (m.status === "completed" || m.ended_at));
  const heldDone = held.filter((m) => getPhase(m, m.extras) === "abgeschlossen");
  const planned = yearMeetings.filter((m) => m.meeting_date && new Date(m.meeting_date) >= startOfDay(now) && !(m.status === "completed" || m.ended_at));
  const nextPlanned = [...planned].sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || ""))[0];
  const withoutMeeting = rows.filter((r) => !r.meeting).length;
  const toClarify = rows.filter((r) => r.meeting && r.step.group === "handeln").length;

  // Saisonleiste
  const months = MONTHS.map((label, i) => {
    const ms = yearMeetings.filter((m) => m.meeting_date && new Date(m.meeting_date).getMonth() === i);
    const blocks = ms.map((m) => {
      const done = m.status === "completed" || !!m.ended_at;
      const past = new Date(m.meeting_date!) < startOfDay(now);
      const name = `${buildings.find((b) => b.id === m.building_id)?.name || ""}${isExtra(m) ? " (außerordentlich)" : ""}`;
      return { id: m.id, name, extra: isExtra(m), kind: done ? "done" : past ? "late" : "planned" } as const;
    });
    return { label, i, blocks, isNow: year === thisYear && now.getMonth() === i };
  });
  const maxInMonth = Math.max(6, ...months.map((m) => m.blocks.length));
  const blockH = Math.max(5, Math.min(14, Math.floor((112 - (maxInMonth - 1) * 2) / maxInMonth)));

  return (
    <div className="space-y-6">
      <section aria-label={`Stand ${year}`} className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiTile label="WEGs" value={buildings.length} hint={`Wirtschaftsjahr ${year}`} dot="bg-slate-500" />
        <KpiTile label="Abgehalten" value={held.length} unit={`von ${buildings.length}`} hint={`ordentliche · ${heldDone.length} vollständig abgeschlossen`} dot="bg-emerald-600" />
        <KpiTile
          label="Geplant"
          value={planned.length}
          hint={nextPlanned ? `nächste: ${relativeDays(new Date(nextPlanned.meeting_date!), now)}, ${buildings.find((b) => b.id === nextPlanned.building_id)?.name || ""}` : "keine anstehend"}
          dot="bg-primary"
        />
        <KpiTile label="Ohne Versammlung" value={withoutMeeting} hint="mind. 1 pro Jahr (§ 24 Abs. 1 WEG)" dot="bg-amber-500" />
        <KpiTile label="Zu klären" value={toClarify} hint="Fristen und offene Ergebnisse" dot="bg-red-600" />
      </section>

      <EtvCard className="px-5 pb-4 pt-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Saison {year}</h2>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-600" />abgehalten</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-primary" />geplant</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-violet-600" />außerordentlich</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-dashed border-red-600" />Termin vorbei, nicht abgeschlossen</span>
          </div>
        </div>
        <div className="grid grid-cols-12 gap-1.5 md:gap-2">
          {months.map((m) => {
            const active = month === m.i;
            return (
              <button
                key={m.label}
                type="button"
                onClick={() => setMonth(active ? null : m.i)}
                title={m.blocks.map((b) => b.name).join(", ") || "keine Versammlung"}
                className={cn(
                  "flex flex-col items-stretch gap-1.5 rounded-[10px] px-1 pt-2 transition-colors hover:bg-muted/60",
                  m.isNow && "bg-primary/5",
                  active && "bg-primary/10 ring-1 ring-primary/40",
                )}
              >
                <span className="h-4 text-center text-[13px] font-semibold tabular-nums text-muted-foreground">{m.blocks.length || ""}</span>
                <span className="flex h-[112px] flex-col-reverse gap-[2px] px-0.5 md:px-1.5">
                  {m.blocks.map((b) => (
                    <span
                      key={b.id}
                      style={{ height: blockH }}
                      className={cn(
                        "block rounded-[2px]",
                        b.kind === "done" && (b.extra ? "bg-violet-400" : "bg-emerald-600"),
                        b.kind === "planned" && (b.extra ? "bg-violet-600" : "bg-primary"),
                        b.kind === "late" && "border-[1.5px] border-dashed border-red-600 bg-background",
                      )}
                    />
                  ))}
                </span>
                <span className={cn("border-t pb-2 pt-1.5 text-center text-xs", m.isNow ? "border-t-2 border-primary font-semibold text-foreground" : "font-medium text-muted-foreground")}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {month === null ? "Monat anklicken, um die Liste darunter auf diesen Monat zu beschränken." : (
            <>Gefiltert auf {MONTHS[month]} · <button type="button" className="font-semibold text-primary" onClick={() => setMonth(null)}>Filter aufheben</button></>
          )}
        </p>
      </EtvCard>

      <EtvCard className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Nach Stand filtern" className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setGroupFilter(null)}
              className={cn("flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                groupFilter === null ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted/60")}
            >
              Alle <span className="tabular-nums text-muted-foreground">{baseRows.length}</span>
            </button>
            {GROUPS.map((g) => {
              const on = groupFilter === g.key;
              const n = groupCounts.get(g.key) || 0;
              return (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setGroupFilter(on ? null : g.key)}
                  className={cn("flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                    on ? "border-primary bg-primary/10 text-primary" : "bg-background hover:bg-muted/60", n === 0 && !on && "text-muted-foreground")}
                >
                  <StatusDot className={g.dot} />
                  {g.short}
                  <span className="tabular-nums text-muted-foreground">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Liegenschaft oder Ort suchen …" className="h-9 pl-9 pr-8" aria-label="Versammlungen durchsuchen" />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Suche leeren" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,2.6fr)_70px_20px] gap-4 border-b bg-muted/30 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <div>Liegenschaft</div><div>Termin</div><div>Phase</div><div>Nächster Schritt</div><div>Themen</div><div />
        </div>
        {grouped.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Keine Einträge für diese Auswahl.</p>
        )}
        {grouped.map((g) => {
          const collapsed = g.key === "erledigt" && !showDone && groupFilter !== "erledigt" && !needle;
          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => g.key === "erledigt" && setShowDone(!showDone)}
                className={cn("flex w-full items-center gap-2.5 px-5 pb-2 pt-4 text-left", g.key !== "erledigt" && "cursor-default")}
              >
                <StatusDot className={g.dot} />
                <h3 className="text-sm font-semibold">{g.title}</h3>
                <span className="text-[13px] text-muted-foreground">{g.rows.length}</span>
                {g.key === "erledigt" && <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showDone && "rotate-180")} />}
              </button>
              {!collapsed && g.rows.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => (r.meeting ? onOpenMeeting(r.meeting.id) : onCreateMeeting(r.building.id))}
                  className="grid w-full grid-cols-1 items-center gap-2 border-t border-border/50 px-5 py-3 text-left transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(0,2.6fr)_70px_20px] md:gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">{r.building.name}</span>
                      {r.extra && <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">außerordentlich</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{r.building.city || r.building.address || ""}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium tabular-nums">{r.meeting ? formatMeetingDate(r.meeting.meeting_date, { weekday: true }) : "kein Termin"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.meeting?.meeting_date ? relativeDays(new Date(r.meeting.meeting_date), now) : r.meeting ? "Termin offen" : `noch keine ${year}`}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <PhaseBars done={Math.min(r.done, 4)} current={r.meeting ? r.done : 0} late={r.late} />
                    <div className="text-xs text-muted-foreground">{r.meeting ? r.phase : "Planung"}</div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Pill urgency={r.step.urgency}>{r.step.tag}</Pill>
                    <span className="truncate text-sm">{r.step.label}</span>
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums">{r.topics || "–"}</div>
                  {r.meeting ? <ChevronRight className="hidden h-4 w-4 text-muted-foreground/60 md:block" /> : <Plus className="hidden h-4 w-4 text-primary md:block" />}
                </button>
              ))}
            </div>
          );
        })}
      </EtvCard>
    </div>
  );
};
