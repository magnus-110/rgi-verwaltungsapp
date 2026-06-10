import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Flag, ChevronDown, ChevronUp, Receipt, CheckCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface BankPurposeData {
  purpose?: string | null;
  debtor_name?: string | null;
  creditor_name?: string | null;
  booking_date?: string | null;
  amount?: number | null;
}

interface Props {
  data: BankPurposeData | null | undefined;
  needsReview: boolean;
  reviewNote?: string | null;
  onToggleReview: (next: boolean, note?: string) => Promise<void> | void;
  /** Zweite Flag: niedrige KI-Konfidenz / unsicher */
  uncertain?: boolean;
  onToggleUncertain?: (next: boolean, note?: string) => Promise<void> | void;
  /** Hide flag toggle (e.g. while booking not yet created) */
  flagDisabled?: boolean;
  className?: string;
}

export function BankPurposePanel({
  data,
  needsReview,
  reviewNote,
  onToggleReview,
  uncertain = false,
  onToggleUncertain,
  flagDisabled,
  className,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const flagsRow = !flagDisabled && (
    <div className="flex items-center gap-1.5 shrink-0">
      <FlagButton
        kind="review"
        active={needsReview}
        note={reviewNote}
        onToggle={onToggleReview}
      />
      {onToggleUncertain && (
        <FlagButton
          kind="uncertain"
          active={uncertain}
          note={reviewNote}
          onToggle={onToggleUncertain}
        />
      )}
    </div>
  );

  if (!data || !data.purpose) {
    if (!flagDisabled) {
      return (
        <div className={cn("flex justify-end", className)}>{flagsRow}</div>
      );
    }
    return null;
  }

  const purpose = data.purpose || "";
  const name = (data.amount ?? 0) < 0 ? data.creditor_name : data.debtor_name;
  const isLong = purpose.length > 120 || purpose.split("\n").length > 2;

  return (
    <div className={cn(
      "rounded-lg border bg-muted/30 p-3 space-y-2",
      needsReview && !uncertain && "border-orange-300 bg-orange-50/60 dark:bg-orange-950/20",
      uncertain && "border-red-300 bg-red-50/60 dark:bg-red-950/20",
      className,
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Receipt className="h-3.5 w-3.5" />
          <span className="font-semibold">Verwendungszweck Kontoauszug</span>
          {data.booking_date && <span>· {format(new Date(data.booking_date), "dd.MM.yyyy")}</span>}
          {name && <span className="truncate max-w-[200px]">· {name}</span>}
          {data.amount != null && (
            <span className={cn("font-mono", data.amount < 0 ? "text-destructive" : "text-green-600")}>
              · {data.amount < 0 ? "" : "+"}{Number(data.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
            </span>
          )}
        </div>
        {flagsRow}
      </div>
      <div>
        <p className={cn(
          "text-sm whitespace-pre-wrap break-words",
          !expanded && isLong && "line-clamp-2",
        )}>
          {purpose}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
          >
            {expanded ? <><ChevronUp className="h-3 w-3" /> Weniger</> : <><ChevronDown className="h-3 w-3" /> Mehr anzeigen</>}
          </button>
        )}
      </div>
      {needsReview && reviewNote && (
        <p className="text-xs text-orange-700 dark:text-orange-300 italic">Notiz: {reviewNote}</p>
      )}
    </div>
  );
}

interface FlagButtonProps {
  kind: "review" | "uncertain";
  active: boolean;
  note?: string | null;
  onToggle: (next: boolean, note?: string) => Promise<void> | void;
}

function FlagButton({ kind, active, note: initialNote, onToggle }: FlagButtonProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [note, setNote] = useState(initialNote ?? "");
  const [busy, setBusy] = useState(false);

  const isReview = kind === "review";
  const Icon = isReview ? Flag : AlertTriangle;
  const labelInactive = isReview ? "Zur Prüfung" : "Unsicher";
  const labelActive = isReview ? "Prüfung erledigt" : "Unsicher entfernen";
  const tooltip = isReview
    ? "Mittlere KI-Konfidenz – bitte gegenprüfen"
    : "Niedrige KI-Konfidenz – Buchung ist unsicher";
  const activeClass = isReview
    ? "border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 bg-orange-50/60 dark:bg-orange-950/30"
    : "border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 bg-red-50/60 dark:bg-red-950/30";

  const handleConfirm = async () => {
    setBusy(true);
    await onToggle(!active, !active ? note : undefined);
    setBusy(false);
    setPopoverOpen(false);
  };

  if (active) {
    return (
      <Button
        size="sm"
        variant="outline"
        title={tooltip}
        className={cn("h-7 text-xs gap-1 shrink-0", activeClass)}
        disabled={busy}
        onClick={handleConfirm}
      >
        <CheckCircle className="h-3.5 w-3.5" />
        {labelActive}
      </Button>
    );
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          title={tooltip}
          className="h-7 text-xs gap-1 shrink-0 text-muted-foreground"
        >
          <Icon className="h-3.5 w-3.5" />
          {labelInactive}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-2">
          <p className="text-xs font-medium">
            {isReview ? "Buchung zur Prüfung markieren" : "Buchung als unsicher markieren"}
          </p>
          <p className="text-[11px] text-muted-foreground">{tooltip}</p>
          <Textarea
            placeholder="Optionale Notiz (z. B. Grund / offene Frage)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-xs min-h-[60px]"
          />
          <Button size="sm" className="w-full h-8 text-xs" disabled={busy} onClick={handleConfirm}>
            <Icon className="h-3.5 w-3.5 mr-1" /> Markieren
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
