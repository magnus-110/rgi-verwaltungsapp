import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { daysBetween, invitationDeadline, relativeDays } from "@/lib/etvPhase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MeetingInvitationPdf } from "../../MeetingInvitationPdf";
import { EtvCard, EtvSectionTitle } from "../ui";
import { AttendancePanel } from "../AttendancePanel";
import { initAttendees, summarize, useAttendees } from "../useAttendees";

interface Props { meeting: any }

export const InvitationPhase = ({ meeting }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: attendees = [] } = useAttendees(meeting.id);
  const sum = summarize(attendees);
  const [sentAt, setSentAt] = useState<string>(meeting.invitation_sent_at || "");
  const [publishing, setPublishing] = useState(false);

  const date = meeting.meeting_date ? new Date(meeting.meeting_date) : null;
  const deadline = date ? invitationDeadline(date) : null;
  const now = new Date();
  const left = deadline ? daysBetween(now, deadline) : null;

  const saveSentAt = async (value: string) => {
    setSentAt(value);
    const { error } = await (supabase as any).from("etv_meetings").update({ invitation_sent_at: value || null }).eq("id", meeting.id);
    if (error) { toast({ title: "Fehler", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["etv-meeting", meeting.id] });
    qc.invalidateQueries({ queryKey: ["etv-meetings"] });
    toast({ title: value ? "Versanddatum gespeichert" : "Versanddatum entfernt" });
  };

  const sentDate = sentAt ? new Date(`${sentAt}T12:00:00`) : null;
  const sentOk = sentDate && deadline ? sentDate <= deadline : null;

  const publish = async (on: boolean) => {
    setPublishing(true);
    try {
      const { error } = await supabase.from("etv_meetings").update({ status: on ? "published" : "draft" }).eq("id", meeting.id);
      if (error) throw error;
      if (on) await initAttendees(meeting.id, meeting.building_id);
      qc.invalidateQueries({ queryKey: ["etv-meeting", meeting.id] });
      qc.invalidateQueries({ queryKey: ["etv-meetings"] });
      qc.invalidateQueries({ queryKey: ["etv-attendees-live", meeting.id] });
      toast({ title: on ? "Im Eigentümerportal freigeschaltet" : "Freischaltung zurückgezogen" });
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const timeline = [
    sentDate
      ? { title: "Einladung versendet", sub: "laut Eintrag", date: sentDate, dot: "bg-emerald-600", fg: "" }
      : { title: left !== null && left >= 0 ? "Einladung versenden" : "Einladung noch nicht versendet", sub: "per E-Mail, Post oder Portal", date: now, dot: "bg-primary", fg: "" },
    deadline && { title: "Spätester Zugang", sub: "letzter Tag der Ladungsfrist", date: deadline, dot: "bg-red-600", fg: "text-red-700 dark:text-red-400" },
    date && { title: "Versammlung", sub: meeting.location || "", date, dot: "bg-muted-foreground/40", fg: "" },
  ].filter(Boolean) as { title: string; sub: string; date: Date; dot: string; fg: string }[];

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-5">
        <EtvCard className="space-y-4 p-5">
          <EtvSectionTitle title="Einladung erstellen" sub="Aus einer Word-Vorlage – pro Eigentümer befüllt. Einladung und Vollmacht aus Claude kannst du wie gewohnt selbst versenden." />
          <MeetingInvitationPdf meetingId={meeting.id} buildingId={meeting.building_id} hideContext />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Im Eigentümerportal freischalten</span>
              <span className="block text-xs text-muted-foreground">Eigentümer sehen die Versammlung, können zu- oder absagen und eine Vollmacht erteilen.</span>
            </span>
            {meeting.status === "published" || meeting.status === "in_progress" || meeting.status === "completed" ? (
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Freigeschaltet</span>
                {meeting.status === "published" && <Button size="sm" variant="ghost" disabled={publishing} onClick={() => confirm("Freischaltung zurückziehen?") && publish(false)}>Zurückziehen</Button>}
              </span>
            ) : (
              <Button variant="outline" className="gap-2" disabled={publishing} onClick={() => publish(true)}><Globe className="h-4 w-4" /> Freischalten</Button>
            )}
          </div>
        </EtvCard>

        <EtvCard className="space-y-4 p-5">
          <EtvSectionTitle
            title="Teilnehmer, Vollmachten und Weisungen"
            sub="Rückmeldungen aus dem Portal erscheinen hier automatisch. Vollmachten und Vorab-Weisungen trägst du direkt ein – sie werden in der Durchführung übernommen."
          />
          <AttendancePanel meetingId={meeting.id} buildingId={meeting.building_id} mode="vorbereitung" />
        </EtvCard>
      </div>

      <div className="space-y-5">
        <EtvCard className="space-y-4 p-5">
          <EtvSectionTitle title="Ladungsfrist" sub="Mindestens 3 Wochen zwischen Zugang und Versammlung (§ 24 Abs. 4 WEG)." />
          {!date ? (
            <p className="text-sm text-muted-foreground">Noch kein Termin – bitte in der Planung festlegen.</p>
          ) : (
            <div>
              {timeline.map((t, i) => (
                <div key={i} className="grid grid-cols-[18px_minmax(0,1fr)_auto] gap-3">
                  <span className="flex flex-col items-center">
                    <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-full", t.dot)} />
                    {i < timeline.length - 1 && <span className="min-h-[22px] w-0.5 flex-1 bg-border" />}
                  </span>
                  <span className="pb-3.5">
                    <span className={cn("block text-sm font-semibold", t.fg)}>{t.title}</span>
                    <span className="block text-xs text-muted-foreground">{t.sub}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums">{t.date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="inv-sent">Einladung versendet am</Label>
            <div className="flex gap-2">
              <Input id="inv-sent" type="date" className="h-[42px]" value={sentAt} onChange={(e) => saveSentAt(e.target.value)} />
              {!sentAt && <Button variant="outline" className="h-[42px] shrink-0" onClick={() => saveSentAt(new Date().toISOString().slice(0, 10))}>Heute</Button>}
            </div>
          </div>
          {date && !sentAt && left !== null && (
            <div className={cn("flex gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed", left < 0 ? "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200" : left <= 3 ? "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200" : "bg-muted/50 text-foreground/80")}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {left < 0
                  ? "Die Ladungsfrist ist nicht mehr einzuhalten. Termin verschieben oder Zustimmung aller Eigentümer prüfen."
                  : <>Zugang spätestens {relativeDays(deadline!, now)} ({deadline!.toLocaleDateString("de-DE")}). Textform genügt (§ 24 Abs. 4 S. 1 WEG) – E-Mail geht sofort zu, per Post einige Tage einplanen.</>}
              </span>
            </div>
          )}
          {sentOk === false && (
            <div className="flex gap-2.5 rounded-xl bg-red-50 px-3.5 py-3 text-[13px] text-red-900 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Versanddatum liegt nach dem letzten Tag der Ladungsfrist.
            </div>
          )}
          {sentOk === true && (
            <div className="flex gap-2.5 rounded-xl bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Frist eingehalten – sofern die Einladung bis {deadline!.toLocaleDateString("de-DE")} zugegangen ist.
            </div>
          )}
        </EtvCard>

        <EtvCard className="p-5">
          <EtvSectionTitle title="Rücklauf bis zur Versammlung" />
          <div className="mt-3">
            {[
              { t: "Zusagen", v: sum.zusagen },
              { t: "Absagen", v: sum.absagen },
              { t: "Vollmachten", v: sum.vollmachten },
              { t: "davon mit Weisungen", v: sum.mitWeisung },
              { t: "Noch keine Rückmeldung", v: Math.max(0, sum.units - sum.zusagen - sum.absagen - sum.vollmachten) },
            ].map((r) => (
              <div key={r.t} className="flex items-center justify-between border-t py-2.5 text-sm">
                <span className="text-muted-foreground">{r.t}</span>
                <span className="font-semibold tabular-nums">{sum.units ? r.v : "–"}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Zählt Einheiten. Vollmachten mit Weisungen werden in der Durchführung automatisch vorausgefüllt.</p>
        </EtvCard>
      </div>
    </div>
  );
};
