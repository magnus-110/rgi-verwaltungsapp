import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  invoiceId: string;
  /** invoices.datev_upload – Standard an. */
  enabled: boolean | null | undefined;
  sentAt?: string | null;
  status?: string | null;
  error?: string | null;
  onChanged?: () => void;
  className?: string;
}

/**
 * Schalter "DATEV" je Rechnung. Nur für Rechnungen anzeigen, die RGI zugeordnet
 * sind. Ist er an, geht die Rechnung beim Bezahlt-Setzen automatisch an DATEV.
 *
 * Absichtlich kein <button>: der Schalter sitzt teils in klickbaren Zeilen,
 * die selbst Buttons sind.
 */
export function DatevToggle({ invoiceId, enabled, sentAt, status, error, onChanged, className }: Props) {
  const [on, setOn] = useState(enabled !== false);
  const [saving, setSaving] = useState(false);
  useEffect(() => setOn(enabled !== false), [enabled]);

  const sent = !!sentAt;
  const failed = !sent && status === "error";

  const title = sent
    ? `An DATEV geschickt am ${format(new Date(sentAt!), "dd.MM.yyyy HH:mm")}`
    : failed
      ? `Senden an DATEV fehlgeschlagen: ${error ?? "unbekannter Fehler"}`
      : on
        ? "DATEV an: Rechnung wird beim Bezahlt-Setzen an DATEV geschickt"
        : "DATEV aus: Rechnung wird nicht an DATEV geschickt";

  const toggle = async (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (saving) return;
    const next = !on;
    setOn(next);
    setSaving(true);
    const { error: err } = await supabase
      .from("invoices")
      .update({ datev_upload: next } as any)
      .eq("id", invoiceId);
    setSaving(false);
    if (err) {
      setOn(!next);
      toast.error("DATEV-Schalter konnte nicht gespeichert werden");
      return;
    }
    onChanged?.();
  };

  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label="DATEV"
      tabIndex={0}
      title={title}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") toggle(e);
      }}
      className={cn(
        "inline-flex select-none items-center gap-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors cursor-pointer",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        failed
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : on
            ? "border-success/30 bg-success/15 text-success"
            : "border-border bg-transparent text-muted-foreground",
        saving && "opacity-60",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-block h-3 w-5 rounded-full transition-colors",
          failed ? "bg-destructive" : on ? "bg-success" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all",
            on ? "left-2.5" : "left-0.5",
          )}
        />
      </span>
      DATEV{sent ? " ✓" : failed ? " !" : ""}
    </span>
  );
}
