import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, User, PenLine, Paperclip, ExternalLink, Loader2, Inbox, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatMeetingDate } from "@/lib/etvPhase";
import { EtvCard, Segmented, EmptyState } from "./ui";
import type { EtvMeetingWithExtras, Topic, TopicStatus } from "./useEtvData";
import { adoptTopic, bundleTopics, deferTopic, reopenTopic, resolveTopic } from "./topicActions";

interface Props {
  topics: Topic[]; // bereits nach Liegenschaft gefiltert
  allTopics: Topic[];
  meetings: EtvMeetingWithExtras[];
  isLoading: boolean;
  onOpenMeeting: (id: string) => void;
}

const STATUS: { value: TopicStatus; label: string; hint: string; pill: string }[] = [
  { value: "neu", label: "Neu", pill: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    hint: "Noch nicht entschieden. Hier landet alles automatisch: Anträge aus dem Eigentümerportal, als ETV-relevant markierte E-Mails und eigene Notizen." },
  { value: "eingeplant", label: "Eingeplant", pill: "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
    hint: "Steht als Punkt auf der Tagesordnung einer Versammlung – oder ist für die nächste Versammlung der WEG vorgemerkt." },
  { value: "zurueckgestellt", label: "Zurückgestellt", pill: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    hint: "Bewusst geparkt, mit Grund. Wird beim Anlegen der nächsten Versammlung der WEG wieder angeboten." },
  { value: "erledigt", label: "Erledigt", pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    hint: "In einer Versammlung behandelt, ohne Versammlung erledigt, abgelehnt, gebündelt oder zurückgezogen." },
];

const SOURCE: Record<Topic["source"], { label: string; icon: any; cls: string }> = {
  portal: { label: "Portal-Antrag", icon: User, cls: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300" },
  email: { label: "E-Mail", icon: Mail, cls: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  note: { label: "Notiz", icon: PenLine, cls: "bg-muted text-muted-foreground" },
};

const OUTCOME: Record<string, string> = {
  behandelt: "In der Versammlung behandelt",
  ohne_versammlung: "Ohne Versammlung erledigt",
  abgelehnt: "Abgelehnt",
  gebuendelt: "Mit einem anderen Thema gebündelt",
  zurueckgezogen: "Zurückgezogen",
};

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "");
const normSubject = (s: string) => s.toLowerCase().replace(/^((re|aw|wg|fw|fwd)\s*:\s*)+/g, "").replace(/\s+/g, " ").trim();

type Panel = null | "adopt" | "defer" | "resolve" | "reject" | "bundle";

export const TopicInbox = ({ topics, allTopics, meetings, isLoading, onOpenMeeting }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { openCompose } = useComposeEmail();

  const [status, setStatus] = useState<TopicStatus>("neu");
  const [selKey, setSelKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);

  // Formularfelder
  const [target, setTarget] = useState<string>("next");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [motion, setMotion] = useState("");
  const [reason, setReason] = useState("");
  const [inform, setInform] = useState(true);
  const [bundleSel, setBundleSel] = useState<string[]>([]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    topics.forEach((t) => (c[t.status] = (c[t.status] || 0) + 1));
    return c;
  }, [topics]);

  const visible = useMemo(() => topics.filter((t) => t.status === status), [topics, status]);
  const sel = topics.find((t) => t.key === selKey) || visible[0] || null;

  useEffect(() => { setPanel(null); }, [selKey, status]);

  const bundledInto = (t: Topic) => allTopics.filter((x) => x.mergedInto === t.key);

  const related = useMemo(() => {
    if (!sel || sel.status !== "neu") return [];
    const words = new Set(normSubject(sel.title).split(" ").filter((w) => w.length > 4));
    return topics.filter((t) => {
      if (t.key === sel.key || t.status !== "neu" || t.buildingId !== sel.buildingId) return false;
      const n = normSubject(t.title);
      if (n === normSubject(sel.title)) return true;
      const tw = n.split(" ").filter((w) => w.length > 4);
      return tw.filter((w) => words.has(w)).length >= 2;
    });
  }, [sel, topics]);

  const targetMeetings = useMemo(() => {
    if (!sel?.buildingId) return [];
    return meetings
      .filter((m) => m.building_id === sel.buildingId && m.status !== "completed" && !m.ended_at && m.status !== "cancelled")
      .sort((a, b) => (a.meeting_date || "9").localeCompare(b.meeting_date || "9"));
  }, [meetings, sel]);

  const openPanel = (p: Panel) => {
    if (!sel) return;
    setPanel(p);
    setReason("");
    setInform(!!sel.fromEmail && sel.source !== "note");
    if (p === "adopt") {
      setTitle(sel.title.replace(/^((re|aw|wg|fw|fwd)\s*:\s*)+/i, ""));
      setDesc(sel.source === "email" ? "" : sel.text);
      setMotion("");
      const firstOk = targetMeetings.find((m) => !m.invitation_sent_at);
      setTarget(firstOk?.id || targetMeetings[0]?.id || "next");
    }
    if (p === "bundle") setBundleSel(related.map((r) => r.key));
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["etv-topics"] });
    qc.invalidateQueries({ queryKey: ["etv-agenda-items"] });
    qc.invalidateQueries({ queryKey: ["admin-submitted-tops"] });
  };

  const informSubmitter = (subject: string, body: string) => {
    if (!inform || !sel?.fromEmail) return;
    openCompose({ prefill: { to: sel.fromEmail, subject, bodyText: body } });
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: ok });
      setPanel(null);
      refresh();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const chosenMeeting = targetMeetings.find((m) => m.id === target);

  const doAdopt = () => run(async () => {
    if (!sel) return;
    const { data: mt } = chosenMeeting
      ? await (supabase as any).from("etv_meetings").select("default_voting_principle").eq("id", chosenMeeting.id).maybeSingle()
      : { data: null };
    const res = await adoptTopic(sel, {
      meetingId: chosenMeeting ? chosenMeeting.id : null,
      title: title.trim() || sel.title,
      description: desc,
      resolution: motion,
      votingPrinciple: mt?.default_voting_principle || "headcount",
      bundled: bundledInto(sel),
    });
    informSubmitter(
      `Ihr Anliegen „${sel.title}“`,
      chosenMeeting
        ? `Guten Tag,\n\nvielen Dank für Ihr Anliegen. Wir haben es als Tagesordnungspunkt ${res.sortOrder} in die Eigentümerversammlung am ${formatMeetingDate(chosenMeeting.meeting_date)} aufgenommen.\n\nMit freundlichen Grüßen`
        : `Guten Tag,\n\nvielen Dank für Ihr Anliegen. Wir haben es für die nächste Eigentümerversammlung vorgemerkt.\n\nMit freundlichen Grüßen`,
    );
  }, chosenMeeting ? "In die Tagesordnung übernommen" : "Für die nächste Versammlung vorgemerkt");

  const doDefer = () => run(async () => {
    if (!sel) return;
    await deferTopic(sel, reason.trim());
    informSubmitter(
      `Ihr Anliegen „${sel.title}“`,
      `Guten Tag,\n\nvielen Dank für Ihr Anliegen. Wir haben es vorerst zurückgestellt${reason.trim() ? `: ${reason.trim()}` : "."}\nWir kommen zur nächsten Versammlung darauf zurück.\n\nMit freundlichen Grüßen`,
    );
  }, "Zurückgestellt");

  const doResolve = (outcome: "ohne_versammlung" | "abgelehnt") => run(async () => {
    if (!sel) return;
    await resolveTopic(sel, outcome, reason.trim());
    informSubmitter(
      `Ihr Anliegen „${sel.title}“`,
      outcome === "abgelehnt"
        ? `Guten Tag,\n\nvielen Dank für Ihr Anliegen. Leider können wir es nicht in die Tagesordnung aufnehmen${reason.trim() ? `: ${reason.trim()}` : "."}\n\nMit freundlichen Grüßen`
        : `Guten Tag,\n\nvielen Dank für Ihr Anliegen. Wir haben es ohne Versammlung erledigt${reason.trim() ? `: ${reason.trim()}` : "."}\n\nMit freundlichen Grüßen`,
    );
  }, outcome === "abgelehnt" ? "Abgelehnt" : "Als erledigt markiert");

  const doReopen = () => run(async () => { if (sel) await reopenTopic(sel); }, "Wieder auf „Neu“ gesetzt");

  const doBundle = () => run(async () => {
    if (!sel) return;
    await bundleTopics(sel, topics.filter((t) => bundleSel.includes(t.key)));
  }, "Zu einem Thema gebündelt");

  const openAttachment = async (path: string) => {
    for (const bucket of ["building-files", "invoices"]) {
      const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (data?.signedUrl) { window.open(data.signedUrl, "_blank", "noopener,noreferrer"); return; }
    }
    toast({ title: "Anhang konnte nicht geöffnet werden", variant: "destructive" });
  };

  const statusInfo = STATUS.find((s) => s.value === status)!;
  const selStatus = sel ? STATUS.find((s) => s.value === sel.status)! : null;
  const selMeeting = sel?.meetingId ? meetings.find((m) => m.id === sel.meetingId) : null;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Liste */}
      <EtvCard className="overflow-hidden">
        <div className="space-y-3 border-b p-3.5">
          <Segmented
            className="flex w-full"
            value={status}
            onChange={(v) => { setStatus(v); setSelKey(null); }}
            options={STATUS.map((s) => ({ value: s.value, label: s.label, count: counts[s.value] || 0 }))}
            ariaLabel="Status"
          />
          <p className="rounded-lg bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">{statusInfo.hint}</p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {isLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {!isLoading && visible.length === 0 && (
            <EmptyState icon={<Inbox className="h-8 w-8" />} title="Keine Themen in dieser Auswahl" />
          )}
          {visible.map((t) => {
            const S = SOURCE[t.source];
            const on = sel?.key === t.key;
            const meta =
              t.status === "neu" ? "Wartet auf Entscheidung"
              : t.status === "eingeplant" ? (t.meetingId ? `→ Versammlung ${formatMeetingDate(meetings.find((m) => m.id === t.meetingId)?.meeting_date)}` : "→ nächste Versammlung")
              : t.status === "zurueckgestellt" ? (t.reason ? `Grund: ${t.reason}` : "zurückgestellt")
              : OUTCOME[t.outcome || ""] || "Erledigt";
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setSelKey(t.key)}
                className={cn(
                  "flex w-full gap-3 border-b border-border/50 px-3.5 py-3 text-left transition-colors hover:bg-muted/40",
                  on && "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]",
                )}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]", S.cls)}>
                  <S.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{t.buildingName} · {S.label}</span>
                    <span className="shrink-0">{fmtDate(t.date)}</span>
                  </span>
                  <span className="block truncate text-sm font-semibold">{t.title}</span>
                  <span className={cn("block truncate text-xs font-medium", t.status === "neu" ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>{meta}</span>
                </span>
              </button>
            );
          })}
        </div>
      </EtvCard>

      {/* Detail */}
      <EtvCard className="space-y-5 p-6">
        {!sel ? (
          <EmptyState title="Kein Thema ausgewählt" text="Wähle links ein Thema aus." />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{sel.buildingName}</span>
                  <span>·</span><span>{SOURCE[sel.source].label} von {sel.from}</span>
                  <span>·</span><span>{fmtDate(sel.date)}</span>
                </div>
                <h2 className="text-[22px] font-semibold leading-tight tracking-tight">{sel.title}</h2>
              </div>
              {selStatus && <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", selStatus.pill)}>{selStatus.label}</span>}
            </div>

            {sel.status !== "neu" && (
              <div className={cn("flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-sm", selStatus?.pill)}>
                <span className="text-foreground">
                  {sel.status === "eingeplant" && (selMeeting ? `Steht auf der Tagesordnung der Versammlung am ${formatMeetingDate(selMeeting.meeting_date)}.` : "Für die nächste Versammlung dieser WEG vorgemerkt.")}
                  {sel.status === "zurueckgestellt" && `Zurückgestellt${sel.reason ? ` – Grund: ${sel.reason}` : "."}`}
                  {sel.status === "erledigt" && `${OUTCOME[sel.outcome || ""] || "Erledigt"}${sel.reason && sel.outcome !== "behandelt" ? ` – ${sel.reason}` : ""}`}
                </span>
                {selMeeting && (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onOpenMeeting(selMeeting.id)}>Zur Versammlung</Button>
                )}
              </div>
            )}

            <div className="whitespace-pre-line rounded-xl border bg-muted/20 px-4 py-3.5 text-sm leading-relaxed text-foreground/90">
              {sel.text || <span className="text-muted-foreground">Kein Text vorhanden.</span>}
            </div>

            {(sel.attachments.length > 0 || sel.source === "email") && (
              <div className="flex flex-wrap gap-2">
                {sel.attachments.map((p) => (
                  <Button key={p} size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openAttachment(p)}>
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="max-w-[220px] truncate">{(p.split("/").pop() || "Anhang").replace(/^\d+-/, "")}</span>
                  </Button>
                ))}
                {sel.source === "email" && (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => navigate(`/inbox?email=${sel.id}`)}>
                    <ExternalLink className="h-3.5 w-3.5" /> E-Mail öffnen
                  </Button>
                )}
              </div>
            )}

            {bundledInto(sel).length > 0 && (
              <div className="rounded-xl border border-dashed px-4 py-3 text-sm">
                <div className="mb-1.5 font-semibold">Gebündelt mit diesem Thema</div>
                {bundledInto(sel).map((b) => (
                  <div key={b.key} className="flex justify-between gap-3 text-[13px]"><span className="truncate">{b.title}</span><span className="text-muted-foreground">{fmtDate(b.date)}</span></div>
                ))}
              </div>
            )}

            {related.length > 0 && panel === null && (
              <div className="space-y-2 rounded-xl border border-dashed px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold">Gehört vermutlich zusammen</span>
                    <span className="block text-xs text-muted-foreground">Bündeln macht daraus ein einziges Thema. Die anderen Einträge bleiben darin als Verlauf erhalten.</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => openPanel("bundle")}>Zu einem Thema bündeln</Button>
                </div>
                {related.map((r) => (
                  <div key={r.key} className="flex justify-between gap-3 text-[13px]"><span className="truncate">{r.title}</span><span className="shrink-0 text-muted-foreground">{fmtDate(r.date)}</span></div>
                ))}
              </div>
            )}

            {/* Aktionen */}
            {panel === null && (
              <div className="flex flex-wrap gap-2.5">
                {(sel.status === "neu" || sel.status === "zurueckgestellt" || (sel.status === "eingeplant" && !sel.meetingId)) && (
                  <Button className="h-11 px-5" onClick={() => openPanel("adopt")}>In Tagesordnung übernehmen</Button>
                )}
                {sel.status === "neu" && <Button variant="outline" className="h-11" onClick={() => openPanel("defer")}>Zurückstellen</Button>}
                {sel.status !== "neu" && <Button variant="outline" className="h-11" onClick={doReopen} disabled={busy}>Wieder auf „Neu“</Button>}
                {(sel.status === "neu" || sel.status === "zurueckgestellt") && (
                  <>
                    <Button variant="outline" className="h-11" onClick={() => openPanel("resolve")}>Ohne Versammlung erledigen</Button>
                    <Button variant="ghost" className="h-11 text-destructive hover:text-destructive" onClick={() => openPanel("reject")}>Ablehnen</Button>
                  </>
                )}
              </div>
            )}

            {panel === "adopt" && (
              <div className="space-y-4 rounded-2xl border bg-primary/[0.03] p-5">
                <h3 className="text-[15px] font-semibold">In Tagesordnung übernehmen</h3>
                <div className="space-y-2">
                  <Label>1. In welche Versammlung?</Label>
                  {[...targetMeetings.map((m) => ({ id: m.id, title: `Versammlung ${formatMeetingDate(m.meeting_date, { weekday: true })}`, warn: !!m.invitation_sent_at,
                    sub: m.invitation_sent_at ? "Achtung: Einladung ist schon raus – über neue Punkte kann dort nicht mehr beschlossen werden (§ 23 Abs. 2 WEG)." : (m.title || "Ordentliche Versammlung") })),
                    { id: "next", title: "Nächste Versammlung dieser WEG", warn: false, sub: targetMeetings.length ? "z. B. eine spätere oder außerordentliche Versammlung" : "Noch keine angelegt – wird beim Anlegen als Punkt angeboten" },
                  ].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setTarget(o.id)}
                      className={cn("flex w-full items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 text-left", target === o.id ? "border-2 border-primary" : "")}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{o.title}</span>
                        <span className={cn("block text-xs", o.warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{o.sub}</span>
                      </span>
                      <span className={cn("h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px]", target === o.id ? "border-[6px] border-primary" : "border-muted-foreground/40")} />
                    </button>
                  ))}
                </div>
                {target !== "next" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="ts-title">2. Titel des Tagesordnungspunkts</Label>
                      <Input id="ts-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Der Originaltext bleibt hier im Themenspeicher unverändert erhalten.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ts-desc">3. Beschreibung</Label>
                      <Textarea id="ts-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ts-motion">4. Beschlussantrag <span className="font-normal text-muted-foreground">(kann auch später formuliert werden)</span></Label>
                      <Textarea id="ts-motion" rows={3} value={motion} onChange={(e) => setMotion(e.target.value)} />
                    </div>
                  </>
                )}
                {chosenMeeting?.invitation_sent_at && (
                  <div className="flex gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Die Einladung zu dieser Versammlung ist schon verschickt. Der Punkt kann dort nur noch als Information behandelt werden.
                  </div>
                )}
                {sel.fromEmail && (
                  <label className="flex items-center gap-2.5 text-sm">
                    <Checkbox checked={inform} onCheckedChange={(v) => setInform(!!v)} />
                    Einreicher per E-Mail informieren (öffnet eine vorbereitete E-Mail)
                  </label>
                )}
                <div className="flex justify-end gap-2.5">
                  <Button variant="outline" onClick={() => setPanel(null)}>Abbrechen</Button>
                  <Button onClick={doAdopt} disabled={busy || (target !== "next" && !title.trim())}>
                    {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    {target === "next" ? "Vormerken" : "Übernehmen"}
                  </Button>
                </div>
              </div>
            )}

            {(panel === "defer" || panel === "resolve" || panel === "reject") && (
              <div className="space-y-4 rounded-2xl border bg-muted/20 p-5">
                <h3 className="text-[15px] font-semibold">
                  {panel === "defer" ? "Zurückstellen" : panel === "resolve" ? "Ohne Versammlung erledigen" : "Ablehnen"}
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="ts-reason">
                    {panel === "defer" ? "Warum wird das Thema zurückgestellt?" : panel === "resolve" ? "Wie wurde es erledigt?" : "Begründung"}
                  </Label>
                  <Textarea
                    id="ts-reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={panel === "defer" ? "z. B. Zweites Angebot fehlt noch" : panel === "resolve" ? "z. B. Hinweis auf die Hausordnung per Rundschreiben" : ""}
                  />
                </div>
                {sel.fromEmail && (
                  <label className="flex items-center gap-2.5 text-sm">
                    <Checkbox checked={inform} onCheckedChange={(v) => setInform(!!v)} />
                    Einreicher per E-Mail informieren (öffnet eine vorbereitete E-Mail)
                  </label>
                )}
                {panel === "defer" && <p className="text-xs text-muted-foreground">Das Thema steht dann unter „Zurückgestellt“ und wird beim Anlegen der nächsten Versammlung dieser WEG wieder angeboten.</p>}
                <div className="flex justify-end gap-2.5">
                  <Button variant="outline" onClick={() => setPanel(null)}>Abbrechen</Button>
                  <Button
                    variant={panel === "reject" ? "destructive" : "default"}
                    disabled={busy || (panel === "defer" && !reason.trim())}
                    onClick={() => (panel === "defer" ? doDefer() : doResolve(panel === "reject" ? "abgelehnt" : "ohne_versammlung"))}
                  >
                    {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    {panel === "defer" ? "Zurückstellen" : panel === "resolve" ? "Als erledigt markieren" : "Ablehnen"}
                  </Button>
                </div>
              </div>
            )}

            {panel === "bundle" && (
              <div className="space-y-3 rounded-2xl border bg-muted/20 p-5">
                <h3 className="text-[15px] font-semibold">Zu einem Thema bündeln</h3>
                <p className="text-[13px] text-muted-foreground">Diese Einträge werden an „{sel.title}“ angehängt und tauchen nicht mehr einzeln unter „Neu“ auf.</p>
                {topics.filter((t) => t.status === "neu" && t.buildingId === sel.buildingId && t.key !== sel.key).map((t) => (
                  <label key={t.key} className="flex items-center gap-2.5 text-sm">
                    <Checkbox
                      checked={bundleSel.includes(t.key)}
                      onCheckedChange={(v) => setBundleSel((p) => (v ? [...p, t.key] : p.filter((k) => k !== t.key)))}
                    />
                    <span className="truncate">{t.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{SOURCE[t.source].label} · {fmtDate(t.date)}</span>
                  </label>
                ))}
                <div className="flex justify-end gap-2.5">
                  <Button variant="outline" onClick={() => setPanel(null)}>Abbrechen</Button>
                  <Button onClick={doBundle} disabled={busy || bundleSel.length === 0}>Bündeln</Button>
                </div>
              </div>
            )}
          </>
        )}
      </EtvCard>
    </div>
  );
};
