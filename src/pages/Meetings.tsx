import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/meetings/etv/ui";
import { WegPicker } from "@/components/meetings/etv/WegPicker";
import { TemplatesSheet } from "@/components/meetings/etv/TemplatesSheet";
import { YearPlan } from "@/components/meetings/etv/YearPlan";
import { TopicInbox } from "@/components/meetings/etv/TopicInbox";
import { MeetingArchive } from "@/components/meetings/etv/MeetingArchive";
import { NewTopicDialog } from "@/components/meetings/etv/NewTopicDialog";
import { MeetingWorkspace } from "@/components/meetings/etv/MeetingWorkspace";
import { useEtvMeetings, useEtvTopics, useWegBuildings } from "@/components/meetings/etv/useEtvData";

type Tab = "plan" | "themen" | "archiv";
const WEG_KEY = "etv-weg-filter";

const readStoredWeg = () => {
  try { return localStorage.getItem(WEG_KEY) || "all"; } catch { return "all"; }
};

export const Meetings = () => {
  const [params, setParams] = useSearchParams();
  const thisYear = new Date().getFullYear();

  const tab = (params.get("tab") as Tab) || "plan";
  const year = Number(params.get("jahr")) || thisYear;
  const weg = params.get("weg") || readStoredWeg();
  const meetingParam = params.get("m");

  const [newTopicOpen, setNewTopicOpen] = useState(false);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
    setParams(next);
  };

  const setWeg = (id: string) => {
    try { localStorage.setItem(WEG_KEY, id); } catch { /* egal */ }
    setParam({ weg: id === "all" ? null : id });
  };

  // Gespeicherten Filter in die Adresse übernehmen, damit er sichtbar ist
  useEffect(() => {
    if (!params.get("weg") && weg !== "all") setParam({ weg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: buildings = [] } = useWegBuildings();
  const { data: meetings = [], isLoading: meetingsLoading } = useEtvMeetings();
  const { data: topics = [], isLoading: topicsLoading } = useEtvTopics();

  const validWeg = weg !== "all" && buildings.some((b) => b.id === weg) ? weg : "all";
  const selectedBuilding = buildings.find((b) => b.id === validWeg) || null;
  const scopedBuildings = useMemo(() => (selectedBuilding ? [selectedBuilding] : buildings), [buildings, selectedBuilding]);
  const scopedMeetings = useMemo(() => (selectedBuilding ? meetings.filter((m) => m.building_id === selectedBuilding.id) : meetings), [meetings, selectedBuilding]);
  const scopedTopics = useMemo(() => (selectedBuilding ? topics.filter((t) => t.buildingId === selectedBuilding.id) : topics), [topics, selectedBuilding]);
  const newTopics = scopedTopics.filter((t) => t.status === "neu").length;

  const openMeeting = (id: string) => setParam({ m: id, b: null, phase: null });
  const createMeeting = (buildingId?: string) =>
    setParam({ m: "neu", b: buildingId || (validWeg !== "all" ? validWeg : null), phase: null, art: null });
  const createExtraordinary = () =>
    setParam({ m: "neu", b: validWeg !== "all" ? validWeg : null, phase: null, art: "ao" });

  if (meetingParam) {
    return (
      <MeetingWorkspace
        meetingId={meetingParam === "neu" ? null : meetingParam}
        initialBuildingId={params.get("b") || undefined}
        initialKind={params.get("art") === "ao" ? "ausserordentlich" : "ordentlich"}
        phase={params.get("phase")}
        onPhaseChange={(p) => setParam({ phase: p })}
        onCreated={(id) => setParam({ m: id, b: null, art: null })}
        onBack={() => setParam({ m: null, b: null, phase: null, art: null })}
      />
    );
  }

  const years = [thisYear - 1, thisYear, thisYear + 1];
  if (!years.includes(year)) years.unshift(year);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-[1320px] space-y-6 px-3 pb-16 pt-5 md:px-8 md:pt-8">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="space-y-1">
            <div className="text-[13px] font-medium text-muted-foreground">Eigentümerversammlungen</div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight md:text-[34px]">Versammlungen</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {tab !== "themen" && (
              <Segmented
                ariaLabel="Wirtschaftsjahr"
                value={String(year)}
                onChange={(v) => setParam({ jahr: v === String(thisYear) ? null : v })}
                options={years.map((y) => ({ value: String(y), label: String(y) }))}
              />
            )}
            <WegPicker buildings={buildings} value={validWeg} onChange={setWeg} />
            <TemplatesSheet />
            {tab === "themen" ? (
              <Button variant="outline" className="h-10 gap-2 rounded-[10px]" onClick={() => setNewTopicOpen(true)}>
                <Plus className="h-4 w-4" /> Thema erfassen
              </Button>
            ) : (
              <Button className="h-10 gap-2 rounded-[10px]" onClick={createExtraordinary} title="Ordentliche Versammlungen legst du direkt im Jahresplan bei der jeweiligen WEG an.">
                <Zap className="h-4 w-4" /> Außerordentliche Versammlung
              </Button>
            )}
          </div>
        </header>

        <nav aria-label="Bereiche" className="flex gap-7 overflow-x-auto border-b">
          {([
            { key: "plan", label: "Jahresplan" },
            { key: "themen", label: "Themenspeicher", badge: newTopics },
            { key: "archiv", label: "Archiv" },
          ] as { key: Tab; label: string; badge?: number }[]).map((t) => (
            <button
              key={t.key}
              type="button"
              aria-current={tab === t.key ? "page" : undefined}
              onClick={() => setParam({ tab: t.key === "plan" ? null : t.key })}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-3 pt-2.5 text-[15px] transition-colors",
                tab === t.key ? "border-primary font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {!!t.badge && (
                <span className="rounded-full bg-red-50 px-2 py-px text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">{t.badge} neu</span>
              )}
            </button>
          ))}
        </nav>

        {tab === "plan" && (meetingsLoading
          ? <p className="py-10 text-center text-sm text-muted-foreground">Wird geladen …</p>
          : (
            <YearPlan
              year={year}
              buildings={scopedBuildings}
              meetings={scopedMeetings}
              topics={scopedTopics}
              onOpenMeeting={openMeeting}
              onCreateMeeting={createMeeting}
            />
          ))}
        {tab === "themen" && (
          <TopicInbox topics={scopedTopics} allTopics={topics} meetings={meetings} isLoading={topicsLoading} onOpenMeeting={openMeeting} />
        )}
        {tab === "archiv" && (
          <MeetingArchive
            year={year}
            buildings={scopedBuildings}
            selectedBuilding={selectedBuilding}
            meetings={scopedMeetings}
            topics={scopedTopics}
            onOpenMeeting={openMeeting}
            onCreateMeeting={createMeeting}
            onSelectBuilding={setWeg}
            onOpenTopics={() => setParam({ tab: "themen" })}
          />
        )}
      </div>

      <NewTopicDialog open={newTopicOpen} onOpenChange={setNewTopicOpen} buildings={buildings} defaultBuildingId={validWeg} />
    </div>
  );
};
