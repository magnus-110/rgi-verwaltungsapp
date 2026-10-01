import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  PHASES, formatMeetingDate, getPhase, invitationDeadline, phaseIndex, relativeDays, type EtvPhase,
} from "@/lib/etvPhase";
import { PlanningPhase } from "./phases/PlanningPhase";
import { InvitationPhase } from "./phases/InvitationPhase";
import { LivePhase } from "./phases/LivePhase";
import { ProtocolPhase } from "./phases/ProtocolPhase";

interface Props {
  meetingId: string | null;
  initialBuildingId?: string;
  phase: string | null;
  onPhaseChange: (p: string) => void;
  onCreated: (id: string) => void;
  onBack: () => void;
}

const db = supabase as any;

export const MeetingWorkspace = ({ meetingId, initialBuildingId, phase, onPhaseChange, onCreated, onBack }: Props) => {
  const { data: meeting, isLoading } = useQuery({
    queryKey: ["etv-meeting", meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await db.from("etv_meetings").select("*, buildings(id, name, address, city, etv_default_location)").eq("id", meetingId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["etv-meeting-stats", meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const [items, sigs, renders] = await Promise.all([
        supabase.from("etv_agenda_items").select("id, status").eq("meeting_id", meetingId!),
        supabase.from("etv_protocol_signatures").select("role").eq("meeting_id", meetingId!),
        supabase.from("etv_protocol_renders").select("id").eq("meeting_id", meetingId!).eq("is_signed", true).limit(1),
      ]);
      const list = items.data || [];
      return {
        agendaCount: list.length,
        decided: list.filter((i: any) => i.status === "voted").length,
        signatureCount: new Set((sigs.data || []).map((x: any) => x.role)).size,
        protocolFiled: (renders.data || []).length > 0,
      };
    },
    refetchInterval: 30_000,
  });

  const current: EtvPhase = meeting ? getPhase(meeting, { ...(stats || {}), protocolFiled: !!stats?.protocolFiled || !!meeting.protocol_published }) : "planung";
  const currentIdx = phaseIndex(current);
  const active = (phase as EtvPhase) || (current === "abgeschlossen" ? "protokoll" : current);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [active]);

  if (meetingId && isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const date = meeting?.meeting_date ? new Date(meeting.meeting_date) : null;
  const deadline = date ? invitationDeadline(date) : null;
  const now = new Date();

  const sub: Record<string, { text: string; warn?: boolean }> = {
    planung: { text: meeting ? `${date ? "Termin steht" : "Termin offen"} · ${stats?.agendaCount ?? 0} Punkte` : "Grunddaten anlegen" },
    einladung: meeting?.invitation_sent_at
      ? { text: `versendet ${new Date(meeting.invitation_sent_at).toLocaleDateString("de-DE")}` }
      : deadline
        ? { text: deadline < now ? "Frist überschritten" : `bis ${deadline.toLocaleDateString("de-DE")} · ${relativeDays(deadline, now)}`, warn: currentIdx <= 1 && (deadline.getTime() - now.getTime()) < 4 * 86400000 }
        : { text: "Termin fehlt" },
    durchfuehrung: meeting?.status === "in_progress" ? { text: "läuft gerade", warn: true }
      : meeting?.status === "completed" || meeting?.ended_at ? { text: "abgehalten" }
      : { text: date ? formatMeetingDate(meeting!.meeting_date, { weekday: true }) : "–" },
    protokoll: stats?.protocolFiled ? { text: "unterschrieben und abgelegt" } : { text: `${stats?.signatureCount ?? 0} von 3 Unterschriften` },
  };

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-[1320px] space-y-5 px-3 pb-16 pt-5 md:px-8 md:pt-7">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-primary hover:opacity-80">
          <ChevronLeft className="h-4 w-4" /> Versammlungen
        </button>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-sm font-semibold text-primary">
                {meeting?.buildings?.name ? `WEG ${meeting.buildings.name}` : "Neue Versammlung"}
                {meeting?.buildings?.city ? `, ${meeting.buildings.city}` : ""}
              </span>
              {meeting?.title && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{meeting.title}</span>
              )}
            </div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight md:text-[30px]">
              {date
                ? `${date.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${date.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr`
                : meeting ? "Termin noch offen" : "Neue Versammlung anlegen"}
            </h1>
            {meeting?.location && <p className="text-sm text-muted-foreground">{meeting.location}</p>}
          </div>
        </header>

        <nav aria-label="Phasen der Versammlung" className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {PHASES.map((p, i) => {
            const done = i < currentIdx;
            const isNow = i === currentIdx;
            const sel = p.key === active;
            const disabled = !meeting && i > 0;
            const s = sub[p.key];
            return (
              <button
                key={p.key}
                type="button"
                disabled={disabled}
                aria-current={sel ? "step" : undefined}
                onClick={() => onPhaseChange(p.key)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors",
                  sel ? "border-primary bg-card" : "border-transparent bg-muted/60 hover:bg-muted",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                    done ? "bg-emerald-700 text-white" : isNow ? "bg-primary text-primary-foreground" : "border-[1.5px] border-muted-foreground/40 bg-background text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{p.label}</span>
                  <span className={cn("block truncate text-xs font-medium", s?.warn ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>{s?.text}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {active === "planung" && (
          <PlanningPhase meeting={meeting || null} initialBuildingId={initialBuildingId} onCreated={onCreated} />
        )}
        {meeting && active === "einladung" && <InvitationPhase meeting={meeting} />}
        {meeting && active === "durchfuehrung" && <LivePhase meeting={meeting} onGoToProtocol={() => onPhaseChange("protokoll")} />}
        {meeting && active === "protokoll" && <ProtocolPhase meeting={meeting} />}
      </div>
    </div>
  );
};
