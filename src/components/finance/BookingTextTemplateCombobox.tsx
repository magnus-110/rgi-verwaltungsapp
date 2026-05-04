import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  buildBookingText,
  periodFromShortcut,
  shortcutSuggestions,
} from "./lib/bookingTextBuilder";

type Props = {
  /** Wirtschaftsjahr für die Berechnung von MM/YY und Q/YY */
  fiscalYear?: number | string | null;
  /** Verknüpfte Rechnung (für Re. Nr. + Lieferant) */
  invoice?: { invoice_number?: string | null; vendor_name?: string | null } | null;
  /** Bezeichnung des aktuell gewählten Gegenkontos */
  counterAccountName?: string | null;
  /** Wird aufgerufen, sobald der Nutzer einen Vorschlag mit Enter übernimmt */
  onApply: (generatedText: string) => void;
  /** Optional: nach Übernahme den Fokus weitersetzen (Enter-Navigation) */
  onCommit?: () => void;
  /** Optional: Komponenten-Größe */
  className?: string;
};

/**
 * Schmales Eingabefeld vor "Buchungstext".
 *
 * Verhalten:
 *  - Standardmäßig ist KEIN Vorschlag vorausgewählt (highlightedIndex = -1).
 *  - Pfeil-runter markiert die erste Option, weiter Pfeil navigiert.
 *  - Enter übernimmt nur dann, wenn ein Vorschlag markiert ist.
 *  - Nach Übernahme wird der generierte Buchungstext aus
 *    [Zeitraum] + Re. Nr. + Lieferant + Gegenkonto gebaut und das Feld geleert.
 */
export function BookingTextTemplateCombobox({
  fiscalYear,
  invoice,
  counterAccountName,
  onApply,
  onCommit,
  className,
}: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = shortcutSuggestions(value, fiscalYear);

  // Reset highlight when input changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [value]);

  const apply = (shortcut: string) => {
    const period = periodFromShortcut(shortcut, fiscalYear);
    const text = buildBookingText({
      period,
      invoiceNumber: invoice?.invoice_number,
      vendorName: invoice?.vendor_name,
      counterAccountName,
    });
    onApply(text);
    setValue("");
    setOpen(false);
    setHighlightedIndex(-1);
    onCommit?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        apply(suggestions[highlightedIndex].shortcut);
      } else if (/^([1-4]|0[1-9]|1[0-2]|000)$/.test(value.trim())) {
        // Direkt-Eingabe ohne Pfeil-Auswahl: nur übernehmen, wenn gültiger Shortcut
        e.preventDefault();
        apply(value.trim());
      }
      // sonst: Standard-Enter (kein Sprung), bewusst NICHT navigieren
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-primary/70">
            #
          </span>
          <Input
            ref={inputRef}
            value={value}
            onChange={e => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Kürzel"
            title="1–4 = Quartal, 01–12 = Monat, 000 = Jahresrechnung"
            className={
              className ??
              "h-9 pl-6 pr-6 text-sm font-mono bg-accent/40 border-2 border-primary/30 focus-visible:border-primary focus-visible:ring-primary/30 rounded-md shadow-sm"
            }
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y:1/2 -translate-y-1/2 text-muted-foreground text-xs">
            ▾
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="p-1 w-64"
        align="start"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div className="text-[10px] text-muted-foreground px-2 py-1">
          ↓ wählen, Enter übernehmen
        </div>
        <div className="max-h-64 overflow-y-auto">
          {suggestions.map((s, idx) => (
            <button
              key={s.shortcut}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                apply(s.shortcut);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={
                "w-full text-left px-2 py-1 text-xs rounded font-mono " +
                (idx === highlightedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted")
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
