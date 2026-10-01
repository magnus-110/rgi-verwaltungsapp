import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatMeetingDate, getPhase, meetingYear } from "@/lib/etvPhase";
import { Button } from "@/components/ui/button";
import { EtvCard, EmptyState } from "./ui";
import type { EtvMeetingWithExtras, Topic, WegBuilding } from "./useEtvData";

interface Props {
  year: number;
  buildings: WegBuilding[];
  selectedBuilding: WegBuilding | null;
  meetings: EtvMeetingWithExtras[];
  topics: Topic[];
  onOpenMeeting: (id: string) => void;
  onCreateMeeting: (buildingId: string) => void;
  onSelectBuilding: (id: string) => void;
  onOpenTopics: () => void;
}

const statusLook = (m: EtvMeetingWithExtras) => {
  const p = getPhase(m, m.extras);
  if (m.status === "cancelled") return { label: "Abgesagt", cls: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" };
  if (p === "abgeschlossen") return { label: "Abgeschlossen", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", dot: "bg-emerald-600" };
  if (p === "protokoll") return { label: "Protokoll offen", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", dot: "bg-blue-600" };
  return { label: "In Vorbereitung", cls: "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300", dot: "bg-primary" };
};

/** Archiv – alle Versammlungen jahresübergreifend. */
export const MeetingArchive = ({
  year, buildings, selectedBuilding, meetings, topics, onOpenMeeting, onCreateMeeting, onSelectBuilding, onOpenTopics,
}: Props) => {
  const years = useMemo(() => {
    const ys = new Set<number>([year - 3, year - 2, year - 1, year]);
    meetings.forEach((m) => ys.add(meetingYear(m)));
    return Array.from(ys).filter((y) => y >= year - 5 && y <= year + 1).sort((a, b) => a - b);
  }, [meetings, year]);

  // Einzelne WEG: Zeitstrahl über die Jahre
  if (selectedBuilding) {
    const ms = meetings.filter((m) => m.building_id === selectedBuilding.id);
    const timelineYears = Array.from(new Set([...ms.map(meetingYear), new Date().getFullYear(), new Date().getFullYear() + 1])).sort((a, b) => b - a);
    const openTopics = topics.filter((t) => t.buildingId === selectedBuilding.id && (t.status === "neu" || t.status === "zurueckgestellt" || (t.status === "eingeplant" && !t.meetingId)));

    return (
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <EtvCard className="p-6">
          <h2 className="mb-4 text-[17px] font-semibold">{selectedBuilding.name} – Versammlungen über die Jahre</h2>
          {timelineYears.map((y) => {
            const list = ms.filter((m) => meetingYear(m) === y);
            const future = y > new Date().getFullYear();
            return (
              <div key={y} className="grid grid-cols-[64px_24px_minmax(0,1fr)] gap-3.5">
                <div className={cn("pt-2.5 text-xl font-semibold tabular-nums", list.length ? "text-foreground" : "text-muted-foreground")}>{y}</div>
                <div className="flex flex-col items-center">
                  <span className={cn("mt-4 h-3.5 w-3.5 shrink-0 rounded-full", list.length ? statusLook(list[0]).dot : "border-2 border-dashed border-muted-foreground/40")} />
                  <span className="mt-1 w-0.5 flex-1 bg-border" />
                </div>
                <div className="mb-3.5 space-y-2.5">
                  {list.length === 0 && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-3.5">
                      <span className="text-sm text-muted-foreground">{future ? "Noch nicht angelegt. Zurückgestellte Themen werden beim Anlegen angeboten." : "Keine Versammlung"}</span>
                      {y >= new Date().getFullYear() && (
                        <Button size="sm" variant="outline" onClick={() => onCreateMeeting(selectedBuilding.id)}>Anlegen</Button>
                      )}
                    </div>
                  )}
                  {list.map((m) => {
                    const s = statusLook(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onOpenMeeting(m.id)}
                        className="w-full space-y-1.5 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-[15px] font-semibold">{formatMeetingDate(m.meeting_date, { weekday: true })}</span>
                          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", s.cls)}>{s.label}</span>
                        </span>
                        <span className="block text-[13px] text-muted-foreground">{m.title}{m.location ? ` · ${m.location}` : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </EtvCard>
        <EtvCard className="space-y-2 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Offene Themen dieser WEG</h2>
            <Button size="sm" variant="ghost" onClick={onOpenTopics}>Themenspeicher</Button>
          </div>
          {openTopics.length === 0 && <p className="py-3 text-sm text-muted-foreground">Keine offenen Themen.</p>}
          {openTopics.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-3 border-t py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="block text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("de-DE")}</span>
              </span>
              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {t.status === "neu" ? "Neu" : t.status === "zurueckgestellt" ? "Zurückgestellt" : "Vorgemerkt"}
              </span>
            </div>
          ))}
        </EtvCard>
      </div>
    );
  }

  // Alle WEGs: Übersicht Liegenschaft × Jahr
  if (buildings.length === 0) return <EtvCard><EmptyState title="Keine Liegenschaften" /></EtvCard>;
  return (
    <EtvCard className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-5 py-3">Liegenschaft</th>
            {years.map((y) => <th key={y} className={cn("px-3 py-3", y === year && "text-foreground")}>{y}</th>)}
          </tr>
        </thead>
        <tbody>
          {buildings.map((b) => (
            <tr key={b.id} className="border-b border-border/50 last:border-0">
              <td className="px-5 py-2.5">
                <button type="button" onClick={() => onSelectBuilding(b.id)} className="text-left font-semibold hover:text-primary">{b.name}</button>
              </td>
              {years.map((y) => {
                const list = meetings.filter((m) => m.building_id === b.id && meetingYear(m) === y);
                return (
                  <td key={y} className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {list.length === 0 && <span className="text-muted-foreground/50">–</span>}
                      {list.map((m) => {
                        const s = statusLook(m);
                        return (
                          <button key={m.id} type="button" onClick={() => onOpenMeeting(m.id)} title={`${s.label} – ${m.title}`}
                            className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left tabular-nums hover:bg-muted">
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} />
                            {m.meeting_date ? new Date(m.meeting_date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "offen"}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-5 py-3 text-xs text-muted-foreground">Liegenschaft anklicken für den Zeitstrahl über alle Jahre. Grün = abgeschlossen, Blau = Protokoll offen, Orange = in Vorbereitung.</p>
    </EtvCard>
  );
};
