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
  /** Aktueller Buchungstext – das Zeitraum-Präfix wird vorangestellt, vorhandener Text bleibt erhalten. */
  existingText?: string | null;
  /** Wenn false, ersetzt ein Kürzel den Buchungstext sauber statt vorhandenen Auto-Text anzuhängen. */
  preserveExistingText?: boolean;
  /** Wird aufgerufen, sobald der Nutzer einen Vorschlag mit Enter übernimmt */
  onApply: (generatedText: string) => void;
  /** Optional: nach Übernahme den Fokus weitersetzen (Enter-Navigation) */
  onCommit?: () => void;
  /** Optional: Enter ohne Auswahl springt zum nächsten Feld */
  onSkip?: () => void;
  /** Externer Ref auf das Input-Element (für Field-Focus-Navigation) */
  inputRef?: React.MutableRefObject<HTMLInputElement | null> | ((el: HTMLInputElement | null) => void);
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
 *  - Enter ohne Auswahl springt zum nächsten Feld (onSkip).
 *  - Nach Übernahme wird der generierte Buchungstext aus
 *    [Zeitraum] + Re. Nr. + Lieferant + Gegenkonto gebaut und das Feld geleert.
 */
export function BookingTextTemplateCombobox({
  fiscalYear,
  invoice,
  counterAccountName,
  existingText,
  preserveExistingText = true,
  onApply,
  onCommit,
  onSkip,
  inputRef: externalRef,
  className,
}: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const localRef = useRef<HTMLInputElement>(null);
  const setRef = (el: HTMLInputElement | null) => {
    localRef.current = el;
    if (typeof externalRef === "function") externalRef(el);
    else if (externalRef) externalRef.current = el;
  };

  const suggestions = shortcutSuggestions(value, fiscalYear);

  // Reset highlight when input changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [value]);

  const apply = (shortcut: string) => {
    const period = periodFromShortcut(shortcut, fiscalYear);
    const generated = buildBookingText({
      period,
      invoiceNumber: invoice?.invoice_number,
      vendorName: invoice?.vendor_name,
      counterAccountName,
    });
    // Wenn der Nutzer ein Kürzel wählt, wollen wir den RGI-Standard-Text:
    // [Zeitraum] [Gegenkonto] [Lieferant], Re. Nr. <Nr.>
    // Vorhandenen Auto-/Generator-Text ERSETZEN (inkl. alter Zeitraum-Präfixe),
    // nur echte User-Zusätze (z.B. handschriftliche Notiz) anhängen.
    const existing = preserveExistingText ? (existingText || "").trim() : "";
    let finalText = generated;
    if (existing) {
      // 1) Führendes Zeitraum-Token entfernen (alt: "09/25", "2. Q/25", "Jahresrechnung")
      let rest = existing
        .replace(/^\s*(?:Jahresrechnung|[1-4]\.\s*Q\/\d{2}|\d{2}\/\d{2})\s*/i, "")
        .trim();
      // 2) Erwarteten Body (ohne Period) des bisherigen Generator-Outputs entfernen
      const expectedBodyOld = buildBookingText({
        period: null,
        invoiceNumber: invoice?.invoice_number,
        vendorName: invoice?.vendor_name,
        counterAccountName,
      });
      if (expectedBodyOld && rest.toLowerCase().startsWith(expectedBodyOld.toLowerCase())) {
        rest = rest.slice(expectedBodyOld.length).replace(/^[\s,;-]+/, "").trim();
      }
      // 3) Doppelung mit neuem Output vermeiden
      if (rest && !generated.toLowerCase().includes(rest.toLowerCase())) {
        finalText = `${generated} ${rest}`.replace(/\s+/g, " ").trim();
      }
    }
    onApply(finalText);
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
      // 1) Pfeil-markierter Vorschlag hat Vorrang
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        apply(suggestions[highlightedIndex].shortcut);
        return;
      }
      // 2) Falls der Nutzer ein gültiges Kürzel direkt eingetippt hat (z.B. "04"),
      //    übernehmen wir es, sobald er Enter drückt.
      const typed = value.trim();
      if (typed && periodFromShortcut(typed, fiscalYear)) {
        e.preventDefault();
        apply(typed);
        return;
      }
      // 3) Eindeutiger Treffer in den Vorschlägen → ebenfalls übernehmen
      if (typed && suggestions.length === 1) {
        e.preventDefault();
        apply(suggestions[0].shortcut);
        return;
      }
      // 4) Sonst: zum nächsten Feld springen
      if (onSkip) {
        e.preventDefault();
        setOpen(false);
        onSkip();
      }
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
            ref={setRef}
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
