import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Flag, ChevronDown, ChevronUp, Receipt, CheckCircle } from "lucide-react";
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
  /** Hide flag toggle (e.g. while booking not yet created) */
  flagDisabled?: boolean;
  className?: string;
}

export function BankPurposePanel({ data, needsReview, reviewNote, onToggleReview, flagDisabled, className }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [note, setNote] = useState(reviewNote ?? "");
  const [busy, setBusy] = useState(false);

  if (!data || !data.purpose) {
    // Still allow flag toggle even without bank tx
    if (!flagDisabled) {
      return (
        <div className={cn("flex justify-end", className)}>
          <FlagButton
            needsReview={needsReview}
            reviewNote={reviewNote}
            busy={busy}
            popoverOpen={popoverOpen}
            setPopoverOpen={setPopoverOpen}
            note={note}
            setNote={setNote}
            onConfirm={async () => {
              setBusy(true);
              await onToggleReview(!needsReview, !needsReview ? note : undefined);
              setBusy(false);
              setPopoverOpen(false);
            }}
          />
        </div>
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
      needsReview && "border-orange-300 bg-orange-50/60 dark:bg-orange-950/20",
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
        {!flagDisabled && (
          <FlagButton
            needsReview={needsReview}
            reviewNote={reviewNote}
            busy={busy}
            popoverOpen={popoverOpen}
            setPopoverOpen={setPopoverOpen}
            note={note}
            setNote={setNote}
            onConfirm={async () => {
              setBusy(true);
              await onToggleReview(!needsReview, !needsReview ? note : undefined);
              setBusy(false);
              setPopoverOpen(false);
            }}
          />
        )}
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

function FlagButton({ needsReview, busy, popoverOpen, setPopoverOpen, note, setNote, onConfirm }: any) {
  if (needsReview) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 shrink-0"
        disabled={busy}
        onClick={onConfirm}
      >
        <CheckCircle className="h-3.5 w-3.5" />
        Prüfung erledigt
      </Button>
    );
  }
  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0">
          <Flag className="h-3.5 w-3.5" />
          Zur Prüfung
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-2">
          <p className="text-xs font-medium">Buchung zur Prüfung markieren</p>
          <Textarea
            placeholder="Optionale Notiz (z. B. Grund / offene Frage)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-xs min-h-[60px]"
          />
          <Button size="sm" className="w-full h-8 text-xs" disabled={busy} onClick={onConfirm}>
            <Flag className="h-3.5 w-3.5 mr-1" /> Markieren
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
