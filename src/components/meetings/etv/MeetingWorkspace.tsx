import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Check, CheckCircle2, Loader2, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  PHASES, formatMeetingDate, getPhase, getStepsDone, invitationDeadline, phaseIndex, relativeDays, type EtvPhase,
} from "@/lib/etvPhase";
import { PlanningPhase } from "./phases/PlanningPhase";
import { InvitationPhase } from "./phases/InvitationPhase";
import { LivePhase } from "./phases/LivePhase";
import { ProtocolPhase } from "./phases/ProtocolPhase";

interface Props {
  meetingId: string | null;
  initialBuildingId?: string;
  initialKind?: "ordentlich" | "ausserordentlich";
  phase: string | null;
  onPhaseChange: (p: string) => void;
  onCreated: (id: string) => void;
  onBack: () => void;
}

const db = supabase as any;

export const MeetingWorkspace = ({ meetingId, initialBuildingId, initialKind = "ordentlich", phase, onPhaseChange, onCreated, onBack }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<null | "delete" | "done">(null);
  const [busy, setBusy] = useState(false);
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

  const phaseExtras = { ...(stats || {}), protocolFiled: !!stats?.protocolFiled || !!meeting?.protocol_published };
  const current: EtvPhase = meeting ? getPhase(meeting, phaseExtras) : "planung";
  const stepsDone = meeting ? getStepsDone(meeting, phaseExtras) : [false, false, false, false];
  const currentIdx = phaseIndex(current);
  const active = (phase as EtvPhase) || (current === "abgeschlossen" ? "protokoll" : current);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [active]);

  if (meetingId && isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["etv-meeting", meetingId] });
    qc.invalidateQueries({ queryKey: ["etv-meeting-stats", meetingId] });
    qc.invalidateQueries({ queryKey: ["etv-meetings"] });
    qc.invalidateQueries({ queryKey: ["etv-topics"] });
  };

  const toggleStep = async (key: string, done: boolean) => {
    if (!meeting) return;
    const next = { ...(meeting.steps_done || {}), [key]: !done };
    // Optimistisch anzeigen
    qc.setQueryData(["etv-meeting", meetingId], (old: any) => (old ? { ...old, steps_done: next } : old));
    const { error } = await db.from("etv_meetings").update({ steps_done: next }).eq("id", meetingId);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); }
    refreshAll();
  };

  const markDone = async () => {
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await db.from("etv_meetings").update({
      status: "completed",
      ended_at: meeting?.ended_at || now,
      protocol_filed_at: meeting?.protocol_filed_at || now,
      steps_done: {},
    }).eq("id", meetingId);
    setBusy(false);
    setConfirm(null);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    refreshAll();
    toast({ title: "Als erledigt markiert" });
  };

  const reopenMeeting = async () => {
    const { error } = await db.from("etv_meetings").update({ protocol_filed_at: null, protocol_published: false, steps_done: { ...(meeting?.steps_done || {}), protokoll: false } }).eq("id", meetingId);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    refreshAll();
    toast({ title: "Wieder offen", description: "Die Versammlung steht jetzt wieder in der Phase Protokoll." });
  };

  const deleteMeeting = async () => {
    setBusy(true);
    const { error } = await db.from("etv_meetings").delete().eq("id", meetingId);
    setBusy(false);
    if (error) { toast({ title: "Löschen fehlgeschlagen", description: error.message, variant: "destructive" }); return; }
    setConfirm(null);
    qc.invalidateQueries({ queryKey: ["etv-meetings"] });
    qc.invalidateQueries({ queryKey: ["etv-topics"] });
    toast({ title: "Versammlung gelöscht" });
    onBack();
  };

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
                : meeting ? "Termin noch offen" : initialKind === "ausserordentlich" ? "Außerordentliche Versammlung anlegen" : "Neue Versammlung anlegen"}
            </h1>
            {meeting?.location && <p className="text-sm text-muted-foreground">{meeting.location}</p>}
          </div>
          {meeting && (
            <div className="flex items-center gap-2">
              {current === "abgeschlossen" ? (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Erledigt
                </span>
              ) : (
                <Button variant="outline" className="gap-2" onClick={() => setConfirm("done")}>
                  <CheckCircle2 className="h-4 w-4" /> Als erledigt markieren
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Weitere Aktionen"><MoreHorizontal className="h-5 w-5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {current === "abgeschlossen" && (
                    <>
                      <DropdownMenuItem onClick={reopenMeeting}><RotateCcw className="mr-2 h-4 w-4" /> Wieder als offen führen</DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirm("delete")}>
                    <Trash2 className="mr-2 h-4 w-4" /> Versammlung löschen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </header>

        <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm === "delete" ? "Versammlung löschen?" : "Versammlung als erledigt markieren?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirm === "delete"
                  ? `„${meeting?.title || "Versammlung"}“ wird unwiderruflich gelöscht – mit allen Tagesordnungspunkten, Abstimmungen, Teilnehmern und Vollmachten.`
                  : "Die Versammlung zählt dann als abgeschlossen und wandert ins Archiv – unabhängig davon, welche Schritte in der App erledigt sind. Du kannst das später rückgängig machen."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                className={confirm === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                onClick={(e) => { e.preventDefault(); confirm === "delete" ? deleteMeeting() : markDone(); }}
              >
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {confirm === "delete" ? "Endgültig löschen" : "Als erledigt markieren"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <nav aria-label="Phasen der Versammlung" className="space-y-1.5">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {PHASES.map((p, i) => {
            const done = stepsDone[i];
            const isNow = i === currentIdx;
            const sel = p.key === active;
            const disabled = !meeting && i > 0;
            const s = sub[p.key];
            return (
              <div
                key={p.key}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors",
                  sel ? "border-primary bg-card" : "border-transparent bg-muted/60 hover:bg-muted",
                  disabled && "opacity-50",
                )}
              >
                <button
                  type="button"
                  disabled={!meeting}
                  onClick={() => toggleStep(p.key, done)}
                  title={done ? "Haken entfernen" : "Schritt abhaken"}
                  aria-label={`${p.label}: ${done ? "Haken entfernen" : "abhaken"}`}
                  aria-pressed={done}
                  className={cn(
                    "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-colors disabled:cursor-not-allowed",
                    done ? "bg-emerald-700 text-white hover:bg-emerald-800"
                      : isNow ? "bg-primary text-primary-foreground hover:ring-2 hover:ring-emerald-600 hover:ring-offset-1"
                      : "border-[1.5px] border-muted-foreground/40 bg-background text-muted-foreground hover:border-emerald-600 hover:text-emerald-700",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-current={sel ? "step" : undefined}
                  onClick={() => onPhaseChange(p.key)}
                  className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                >
                  <span className="block text-[15px] font-semibold">{p.label}</span>
                  <span className={cn("block truncate text-xs font-medium", s?.warn && !done ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>{s?.text}</span>
                </button>
              </div>
            );
          })}
        </div>
        {meeting && <p className="px-1 text-xs text-muted-foreground">Tipp: Auf den Kreis klicken, um einen Schritt von Hand abzuhaken – oder den Haken wieder zu entfernen.</p>}
        </nav>

        {active === "planung" && (
          <PlanningPhase meeting={meeting || null} initialBuildingId={initialBuildingId} initialKind={initialKind} onCreated={onCreated} />
        )}
        {meeting && active === "einladung" && <InvitationPhase meeting={meeting} />}
        {meeting && active === "durchfuehrung" && <LivePhase meeting={meeting} onGoToProtocol={() => onPhaseChange("protokoll")} />}
        {meeting && active === "protokoll" && <ProtocolPhase meeting={meeting} />}
      </div>
    </div>
  );
};
