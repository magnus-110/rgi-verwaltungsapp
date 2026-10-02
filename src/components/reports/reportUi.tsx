import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  REPORT_STATUS_LABEL,
  ReportStatus,
  StaffProfile,
  staffInitials,
  staffName,
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
