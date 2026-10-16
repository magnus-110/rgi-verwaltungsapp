/**
 * Bausteine für die Aufnahme am Tablet: große Knöpfe (mind. 44 px), wenig Tippen.
 */
import type { ReactNode } from "react";
import { Mic, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInputButton } from "@/components/shared/VoiceInputButton";

export function Karte({ titel, children, className }: { titel?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card px-4 py-2 sm:px-5", className)}>
      {titel && <div className="pb-1 pt-3 text-[13px] font-medium text-muted-foreground">{titel}</div>}
      {children}
    </section>
  );
}

/** Einzelauswahl als Knopfreihe; nochmal tippen hebt die Auswahl auf. */
export function Auswahl<T extends string>({
  optionen,
  wert,
  onChange,
  breit,
}: {
  optionen: readonly T[];
  wert: T | null | undefined;
  onChange: (v: T | null) => void;
  breit?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", breit ? "" : "justify-end")}>
      {optionen.map((o) => {
        const an = wert === o;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={an}
            onClick={() => onChange(an ? null : o)}
            className={cn(
              "h-11 min-w-[64px] rounded-lg border px-3.5 text-sm transition-colors",
              an ? "border-foreground bg-foreground font-medium text-background" : "bg-background hover:bg-muted",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Eine Frage-Zeile: Text links, Knöpfe rechts, Folgefragen darunter eingerückt. */
export function Frage({ label, children, folge, letzte }: { label: string; children: ReactNode; folge?: ReactNode; letzte?: boolean }) {
  return (
    <div className={cn("py-3", !letzte && "border-b border-border/60")}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-[15px] font-medium">{label}</span>
        {children}
      </div>
      {folge && <div className="ml-0 mt-2.5 space-y-2 sm:ml-4">{folge}</div>}
    </div>
  );
}

export function Chip({ an, children, onClick, gestrichelt }: { an?: boolean; children: ReactNode; onClick?: () => void; gestrichelt?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={an}
      onClick={onClick}
      className={cn(
        "h-11 rounded-full border px-4 text-sm transition-colors",
        an
          ? "border-primary bg-primary/10 font-medium text-primary"
          : gestrichelt
            ? "border-dashed text-muted-foreground hover:bg-muted"
            : "bg-background hover:bg-muted",
      )}
    >
      {an ? "✓ " : ""}
      {children}
    </button>
  );
}

/** Eingabefeld mit Diktier-Knopf */
export function TextFeld({
  wert,
  onChange,
  platzhalter,
  label,
  mehrzeilig,
  kontext,
  onEntfernen,
}: {
  wert: string | undefined;
  onChange: (v: string) => void;
  platzhalter?: string;
  label: string;
  mehrzeilig?: boolean;
  kontext?: string;
  onEntfernen?: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      {mehrzeilig ? (
        <Textarea
          aria-label={label}
          value={wert ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={platzhalter}
          rows={3}
          className="min-h-[52px] flex-1 rounded-xl text-base"
        />
      ) : (
        <input
          aria-label={label}
          value={wert ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={platzhalter}
          className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-3.5 text-base outline-none focus:ring-2 focus:ring-primary"
        />
      )}
      <VoiceInputButton
        onResult={onChange}
        appendMode
        currentValue={wert ?? ""}
        contextHint={kontext ?? label}
        buttonSize="icon"
        iconClassName="h-12 w-12 shrink-0 rounded-xl border text-foreground"
        tooltip="Diktieren"
      />
      {onEntfernen && (
        <button
          type="button"
          onClick={onEntfernen}
          aria-label="Entfernen"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export const MikroIcon = Mic;
