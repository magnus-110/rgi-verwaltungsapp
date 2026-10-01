import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { URGENCY_CLASSES, type Urgency } from "@/lib/etvPhase";

/** Ruhige Karte im Stil der neuen Versammlungsseite. */
export const EtvCard = ({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-2xl border border-border/70 bg-card", className)} {...rest}>
    {children}
  </div>
);

export const EtvSectionTitle = ({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0 space-y-0.5">
      <h2 className="text-[17px] font-semibold leading-tight text-foreground">{title}</h2>
      {sub && <p className="text-[13px] leading-snug text-muted-foreground">{sub}</p>}
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </div>
);

export const Pill = ({ urgency = "gray", children, className }: { urgency?: Urgency; children: ReactNode; className?: string }) => (
  <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold", URGENCY_CLASSES[urgency], className)}>
    {children}
  </span>
);

export const StatusDot = ({ className }: { className?: string }) => (
  <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} />
);

/** Segmentierte Auswahl wie bei macOS/iOS. */
export function Segmented<T extends string>({
  value, onChange, options, size = "md", className, ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("inline-flex rounded-[10px] bg-muted p-[3px]", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg transition-all",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-[13px]",
              active ? "bg-background font-semibold text-foreground shadow-sm" : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="ml-1 font-medium text-muted-foreground">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Vier kleine Balken für den Fortschritt einer Versammlung. */
export const PhaseBars = ({ done, current, late }: { done: number; current?: number; late?: boolean }) => (
  <div className="grid grid-cols-4 gap-[3px]">
    {[0, 1, 2, 3].map((i) => (
      <div
        key={i}
        className={cn(
          "h-1.5 rounded-full",
          i < done ? "bg-emerald-600" : i === current ? (late ? "bg-red-600" : "bg-primary") : "bg-muted",
        )}
      />
    ))}
  </div>
);

/** Aufklappbarer Abschnitt mit Kurzfassung im eingeklappten Zustand. */
export const Accordion = ({
  title, summary, open, onToggle, children, className,
}: {
  title: ReactNode;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) => (
  <EtvCard className={cn("overflow-hidden", className)}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold text-foreground">{title}</span>
        {summary && <span className="block truncate text-[13px] text-muted-foreground">{summary}</span>}
      </span>
      <ChevronDown className={cn("h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
    </button>
    {open && <div className="px-5 pb-5">{children}</div>}
  </EtvCard>
);

export const KpiTile = ({ label, value, unit, hint, dot }: { label: string; value: ReactNode; unit?: string; hint?: string; dot: string }) => (
  <EtvCard className="flex flex-col gap-1.5 px-4 py-3.5">
    <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
      <StatusDot className={dot} />
      {label}
    </div>
    <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
      {value}
      {unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}
    </div>
    {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
  </EtvCard>
);

export const EmptyState = ({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    {icon && <div className="mb-1 text-muted-foreground">{icon}</div>}
    <p className="text-sm font-semibold">{title}</p>
    {text && <p className="max-w-md text-sm text-muted-foreground">{text}</p>}
    {action && <div className="mt-2">{action}</div>}
  </div>
);
