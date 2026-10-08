import { Activity, Lock, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportEvent, StaffProfile, staffFirstName } from "@/hooks/useReports";
import { dateTime } from "@/lib/reports";
import { AttachmentChips } from "./reportUi";

export type TimelineFilter = "all" | "reporter" | "internal";

const isForReporter = (e: ReportEvent) => e.kind === "step" || e.kind === "message" || e.kind === "reply";
const isInternal = (e: ReportEvent) => e.kind === "note" || e.kind === "assignment" || e.kind === "system";

interface Props {
  events: ReportEvent[];
  filter: TimelineFilter;
  staff: Map<string, StaffProfile>;
  reporterName: string;
}

/**
 * Der Verlauf einer Meldung — alles in zeitlicher Reihenfolge:
 * Stände (orange Linie), Nachrichten an den Melder (blau, rechts),
 * Antworten des Melders (grau, links), interne Einträge (gelb, mit Schloss).
 */
export function ReportTimeline({ events, filter, staff, reporterName }: Props) {
  const shown = events
    // Reiner Zuständigkeitswechsel ohne Erklärung ist kein Ereignis im Verlauf.
    .filter((e) => !(e.kind === "assignment" && !e.body?.trim()))
    .filter((e) => (filter === "all" ? true : filter === "reporter" ? isForReporter(e) : isInternal(e)));
  const firstName = reporterName.split(" ")[0] || "Melder";
  const nameOf = (id: string | null) => (id ? staffFirstName(staff.get(id)) : "Verwaltung");

  if (shown.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">Noch nichts passiert.</p>;
  }

  return (
    <div className="grid gap-2.5">
      {shown.map((e) => {
        if (e.kind === "step") {
          return (
            <div key={e.id} className="flex gap-2.5 border-l-[3px] border-primary py-0.5 pl-2.5 text-[12.5px]">
              <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-semibold">Stand: {e.step_label}</p>
                {e.body && <p className="whitespace-pre-wrap text-foreground/80">{e.body}</p>}
                <p className="text-[11px] text-muted-foreground">
                  {nameOf(e.created_by)} · {dateTime(e.created_at)}
                  {e.visible_to_reporter ? ` · für ${firstName} sichtbar` : ""}
                  {e.allow_reply ? " · Antwort erlaubt" : ""}
                </p>
              </div>
            </div>
          );
        }
        if (e.kind === "message") {
          return (
            <div
              key={e.id}
              className="max-w-[88%] justify-self-end rounded-xl rounded-br-sm bg-sky-500/10 px-3 py-2 text-[12.5px]"
            >
              <p className="whitespace-pre-wrap">{e.body}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                {nameOf(e.created_by)} · {dateTime(e.created_at)}
                <Tag>{e.visible_to_reporter ? "im Portal" : "nur E-Mail"}</Tag>
                {e.sent_by_email && e.visible_to_reporter && (
                  <Tag>
                    <Mail className="h-2.5 w-2.5" /> + E-Mail
                  </Tag>
                )}
                {e.allow_reply && <Tag tone="ok">Antwort erlaubt</Tag>}
              </p>
            </div>
          );
        }
        if (e.kind === "reply") {
          return (
            <div
              key={e.id}
              className="max-w-[88%] justify-self-start rounded-xl rounded-bl-sm border bg-muted/50 px-3 py-2 text-[12.5px]"
            >
              {e.body && <p className="whitespace-pre-wrap">{e.body}</p>}
              <AttachmentChips attachments={e.attachments} className="mt-1.5" />
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                {reporterName} · {dateTime(e.created_at)} · aus dem Portal
              </p>
            </div>
          );
        }
        if (e.kind === "note" || e.kind === "assignment") {
          const head =
            e.kind === "assignment"
              ? `${nameOf(e.created_by)} → ${e.assigned_to ? staffFirstName(staff.get(e.assigned_to)) : "niemand"}`
              : nameOf(e.created_by);
          return (
            <div key={e.id} className="max-w-[88%] rounded-xl bg-amber-500/10 px-3 py-2 text-[12.5px]">
              {e.body ? (
                <p className="whitespace-pre-wrap">{e.body}</p>
              ) : (
                <p className="text-foreground/80">Zuständigkeit geändert</p>
              )}
              <p className="mt-1 flex items-center gap-1 text-[10.5px] text-amber-800/80 dark:text-amber-300/80">
                <Lock className="h-2.5 w-2.5" /> Intern · {head} · {dateTime(e.created_at)}
              </p>
            </div>
          );
        }
        return (
          <p key={e.id} className="text-center text-[11.5px] text-muted-foreground">
            {e.body} · {dateTime(e.created_at)}
          </p>
        );
      })}
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "ok" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded border bg-background px-1 text-[10px]",
        tone === "ok" ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
