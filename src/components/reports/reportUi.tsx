import { Paperclip } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  REPORT_STATUS_LABEL,
  ReportStatus,
  StaffProfile,
  parseAttachments,
  staffInitials,
  staffName,
  useReportAttachmentUrls,
} from "@/hooks/useReports";

/** Kleine Bausteine, die Liste, Detail und Dialoge gemeinsam nutzen. */

const STATUS_CLASS: Record<ReportStatus, string> = {
  open: "bg-destructive/10 text-destructive",
  in_progress: "bg-primary/10 text-primary",
  waiting: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export function ReportStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = (status as ReportStatus) in STATUS_CLASS ? (status as ReportStatus) : "open";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        STATUS_CLASS[s],
        className,
      )}
    >
      {REPORT_STATUS_LABEL[s]}
    </span>
  );
}

export function MiniTag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "danger" | "info" | "success" | "warning";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold leading-4 whitespace-nowrap",
        tone === "neutral" && "border border-border text-muted-foreground",
        tone === "danger" && "bg-destructive/10 text-destructive",
        tone === "info" && "bg-sky-500/10 text-sky-700 dark:text-sky-300",
        tone === "success" && "bg-emerald-600 text-white",
        tone === "warning" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StaffAvatar({
  profile,
  empty,
  size = "sm",
  className,
}: {
  profile?: StaffProfile | null;
  /** Kein Profil: gestrichelter Kreis „noch niemand zuständig“. */
  empty?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const dim = size === "sm" ? "h-[22px] w-[22px] text-[9.5px]" : "h-8 w-8 text-[11px]";
  if (!profile || empty) {
    return (
      <span
        title="Noch niemand zuständig"
        className={cn(
          "inline-grid shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-muted-foreground/40 font-bold text-muted-foreground/60",
          dim,
          className,
        )}
      >
        ?
      </span>
    );
  }
  return (
    <span
      title={staffName(profile)}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary",
        dim,
        className,
      )}
    >
      {staffInitials(profile)}
    </span>
  );
}

/** Checkbox-Zeile, wie sie in mehreren Dialogen vorkommt. */
export function CheckRow({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(!!v)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

/** Hochgeladene Fotos und Dokumente als anklickbare Chips (öffnen in neuem Tab). */
export function AttachmentChips({ attachments, className }: { attachments: unknown; className?: string }) {
  const list = parseAttachments(attachments);
  const { data: links = [] } = useReportAttachmentUrls(attachments);
  if (list.length === 0) return null;
  const items = links.length ? links : list.map((a) => ({ ...a, url: null as string | null }));
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((a, i) =>
        a.url ? (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-0.5 text-[11.5px] hover:border-primary/40 hover:bg-primary/5"
          >
            <Paperclip className="h-3 w-3 shrink-0" />
            <span className="truncate">{a.name}</span>
          </a>
        ) : (
          <span
            key={i}
            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] text-muted-foreground"
          >
            <Paperclip className="h-3 w-3 shrink-0" />
            <span className="truncate">{a.name}</span>
          </span>
        ),
      )}
    </div>
  );
}
