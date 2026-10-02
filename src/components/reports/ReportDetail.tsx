import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  CheckSquare,
  FolderKanban,
  Loader2,
  Lock,
  Mail,
  MoreHorizontal,
  Paperclip,
  Reply,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  REPORT_CHANNEL_LABEL,
  ReportChannel,
  StaffProfile,
  currentStandOf,
  hasPortalAccess,
  useMarkReportRead,
  useReopenReport,
  useReport,
  useReportAttachmentUrls,
  useReportEvents,
  useReportTodos,
  useSetReportPriority,
  useSetReportReplyOpen,
  useUnlinkReportCase,
} from "@/hooks/useReports";
import { ReportAssignButton } from "./ReportAssignButton";
import { ReportCaseDialog } from "./ReportCaseDialog";
import { ComposerMode, ReportComposer } from "./ReportComposer";
import { ReportStepDialog } from "./ReportStepDialog";
import { ReportTaskDialog } from "./ReportTaskDialog";
import { ReportTimeline, TimelineFilter } from "./ReportTimeline";
import { ResolveReportDialog } from "./ResolveReportDialog";
import { MiniTag, ReportStatusBadge } from "./reportUi";
import { dateTime, errorMessage } from "@/lib/reports";

interface Props {
  reportId: string;
  staff: StaffProfile[];
  staffMap: Map<string, StaffProfile>;
  /** Am Handy: zurück zur Liste. */
  onBack?: () => void;
  onOpenEmail: (emailId: string) => void;
}

export function ReportDetail({ reportId, staff, staffMap, onBack, onOpenEmail }: Props) {
  const { data: report, isLoading } = useReport(reportId);
  const { data: events = [] } = useReportEvents(reportId);
  const { data: todos = [] } = useReportTodos(reportId);
  const { data: attachments = [] } = useReportAttachmentUrls(report?.id ?? null, report?.attachments);
  const markRead = useMarkReportRead();
  const reopen = useReopenReport();
  const setReplyOpen = useSetReportReplyOpen();
  const setPriority = useSetReportPriority();
  const unlinkCase = useUnlinkReportCase();

  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [dialog, setDialog] = useState<"step" | "resolve" | "task" | "case" | null>(null);

  useEffect(() => {
    setComposer(null);
    setFilter("all");
    setDialog(null);
  }, [reportId]);

  // Geöffnet = gelesen.
  useEffect(() => {
    if (report && (!report.is_read || report.has_new_reply)) markRead.mutate(report);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, report?.is_read, report?.has_new_reply]);

  const { data: linkedCase } = useCaseTitle(report?.case_id ?? null);
  const openTodos = useMemo(() => todos.filter((t) => t.status !== "done"), [todos]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Laden …
      </div>
    );
  }
  if (!report) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Meldung nicht gefunden.</div>;
  }

  const done = report.status === "resolved";
  const portal = hasPortalAccess(report);
  const firstName = (report.contact_name || "Melder").split(" ")[0];

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Werkzeugleiste */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2">
        {onBack && (
          <Button variant="ghost" size="sm" className="gap-1 px-2 md:hidden" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Zurück
          </Button>
        )}
        <ReportAssignButton report={report} staff={staff} disabled={done} />
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setDialog("task")}
          disabled={done}
          title="Aufgabe aus dieser Meldung erstellen"
        >
          <CheckSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Aufgabe</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setDialog("case")}
          disabled={done}
          title="Einem Vorgang zuordnen"
        >
          <FolderKanban className="h-4 w-4" />
          <span className="hidden sm:inline">Vorgang</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Weitere Aktionen">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              disabled={done}
              onClick={() =>
                setPriority.mutate(
                  { reportId: report.id, urgent: report.priority !== "urgent" },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {report.priority === "urgent" ? "Nicht mehr dringend" : "Als dringend markieren"}
            </DropdownMenuItem>
            {portal && !done && (
              <DropdownMenuItem
                onClick={() =>
                  setReplyOpen.mutate(
                    { reportId: report.id, open: !report.reply_open },
                    {
                      onSuccess: () => toast.success(report.reply_open ? "Antworten geschlossen" : `${firstName} kann jetzt antworten`),
                      onError: (e) => toast.error(errorMessage(e)),
                    },
                  )
                }
              >
                <Reply className="mr-2 h-4 w-4" />
                {report.reply_open ? "Antworten schließen" : `${firstName} antworten lassen`}
              </DropdownMenuItem>
            )}
            {report.source_email_id && (
              <DropdownMenuItem onClick={() => onOpenEmail(report.source_email_id!)}>
                <Mail className="mr-2 h-4 w-4" /> Ursprüngliche E-Mail öffnen
              </DropdownMenuItem>
            )}
            {report.case_id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => unlinkCase.mutate(report, { onError: (e) => toast.error(errorMessage(e)) })}
                >
                  <FolderKanban className="mr-2 h-4 w-4" /> Verknüpfung zum Vorgang lösen
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        {/* Kopf */}
        <div className="space-y-1.5 border-b px-5 pb-3 pt-4">
          <h1 className="text-[19px] font-semibold leading-snug">{report.title}</h1>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
            <span className="font-semibold text-foreground">{report.contact_name || "Unbekannt"}</span>
            <span>·</span>
            <Building2 className="h-3.5 w-3.5" />
            <span>{report.building?.name || "Ohne Gebäude"}</span>
            {report.management_mode === "rent" && <MiniTag>Miete</MiniTag>}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <ReportStatusBadge status={report.status} />
            {!done && (
              <span className="text-xs">
                <span className="text-muted-foreground">Stand: </span>
                {currentStandOf(report)}
              </span>
            )}
            {report.priority === "urgent" && !done && <MiniTag tone="danger">dringend</MiniTag>}
            {report.case_id && (
              <Link
                to={`/vorgaenge/${report.case_id}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                {linkedCase?.title || "Vorgang"}
              </Link>
            )}
            {openTodos.map((t) => (
              <Link
                key={t.id}
                to={`/pinnwand/${t.id}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                title={t.title}
              >
                <CheckSquare className="h-3.5 w-3.5" /> Aufgabe
              </Link>
            ))}
            {!portal && <MiniTag>kein Portalzugang</MiniTag>}
          </div>
          {done && (
            <p className="flex items-center gap-1.5 pt-1 text-xs text-emerald-700 dark:text-emerald-300">
              <Check className="h-3.5 w-3.5" />
              Erledigt{report.resolved_reason ? ` (${report.resolved_reason})` : ""}
              {report.resolved_at ? ` am ${dateTime(report.resolved_at)}` : ""}
            </p>
          )}
          {report.reply_open && !done && (
            <div className="mt-1 flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-800 dark:text-emerald-300">
              <Reply className="h-3.5 w-3.5" />
              <span className="flex-1">{firstName} kann gerade im Portal antworten.</span>
              <button
                type="button"
                className="font-medium hover:underline"
                onClick={() => setReplyOpen.mutate({ reportId: report.id, open: false })}
              >
                Schließen
              </button>
            </div>
          )}
        </div>

        {/* Ursprüngliche Meldung */}
        <div className="mx-5 mt-4 space-y-2 rounded-xl border px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            {report.report_number} · {REPORT_CHANNEL_LABEL[report.channel as ReportChannel] || report.channel} ·{" "}
            {dateTime(report.created_at)}
          </p>
          <p className="whitespace-pre-wrap text-[13.5px]">{report.description || "—"}</p>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((a, i) =>
                a.url ? (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-0.5 text-[11.5px] hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate">{a.name}</span>
                  </a>
                ) : (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] text-muted-foreground">
                    <Paperclip className="h-3 w-3" /> {a.name}
                  </span>
                ),
              )}
            </div>
          )}
          {(report.contact_email || report.contact_phone) && (
            <p className="text-[11.5px] text-muted-foreground">
              {[report.contact_email, report.contact_phone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* Verlauf */}
        <div className="flex items-center gap-1 px-5 pb-1.5 pt-4">
          <span className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Verlauf</span>
          {(
            [
              ["all", "Alles"],
              ["reporter", "Mit Melder"],
              ["internal", "Intern"],
            ] as [TimelineFilter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors",
                filter === k ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="px-5 pb-6 pt-1">
          <ReportTimeline
            events={events}
            filter={filter}
            staff={staffMap}
            reporterName={report.contact_name || "Melder"}
          />
        </div>
      </ScrollArea>

      {composer && (
        <ReportComposer report={report} mode={composer} onModeChange={setComposer} onClose={() => setComposer(null)} />
      )}

      {/* Fußleiste */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t px-3 py-2.5">
        {!done ? (
          <>
            <Button
              size="sm"
              variant={composer === "message" ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setComposer("message")}
            >
              <Reply className="h-3.5 w-3.5" /> Nachricht
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setComposer("note")}>
              <Lock className="h-3.5 w-3.5" /> Notiz
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDialog("step")}>
              <Activity className="h-3.5 w-3.5" /> Stand
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setDialog("resolve")}
            >
              <Check className="h-3.5 w-3.5" /> Erledigen
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setComposer("note")}>
              <Lock className="h-3.5 w-3.5" /> Notiz
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={reopen.isPending}
              onClick={() =>
                reopen.mutate(report, {
                  onSuccess: () => toast.success("Wieder geöffnet"),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <RotateCcw className="h-3.5 w-3.5" /> Wieder öffnen
            </Button>
          </>
        )}
      </div>

      <ReportStepDialog report={report} open={dialog === "step"} onOpenChange={(v) => setDialog(v ? "step" : null)} />
      <ResolveReportDialog report={report} open={dialog === "resolve"} onOpenChange={(v) => setDialog(v ? "resolve" : null)} />
      <ReportTaskDialog
        report={report}
        staff={staff}
        open={dialog === "task"}
        onOpenChange={(v) => setDialog(v ? "task" : null)}
      />
      <ReportCaseDialog report={report} open={dialog === "case"} onOpenChange={(v) => setDialog(v ? "case" : null)} />
    </div>
  );
}

/** Titel des verknüpften Vorgangs für den Link im Kopf. */
function useCaseTitle(caseId: string | null) {
  return useQuery({
    queryKey: ["case-title", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data } = await supabase.from("cases").select("id, title").eq("id", caseId!).maybeSingle();
      return data;
    },
  });
}
