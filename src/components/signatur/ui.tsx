/**
 * Kleine Bausteine im RGI-Stil für die Unterschriften-Oberflächen:
 * Buttons (44 px, Radius 8), Abschnittsüberschriften in Versalien, Karten.
 */
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variante = "primaer" | "sekundaer" | "gestrichelt";

export const SigButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; loading?: boolean; klein?: boolean }
>(({ variante = "sekundaer", loading, klein, className, children, disabled, ...rest }, ref) => (
  <button
    ref={ref}
    type="button"
    disabled={disabled || loading}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 text-[14px] font-semibold transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee7202] focus-visible:ring-offset-1",
      "disabled:cursor-not-allowed",
      klein ? "h-9 px-3 text-[13px]" : "h-11",
      variante === "primaer" && "bg-[#B35300] text-white hover:bg-[#9A4700] disabled:bg-[#E3E3E3] disabled:text-[#8A8A8A]",
      variante === "sekundaer" && "border border-[#D6D6D6] bg-white text-[#2B2B2B] hover:bg-[#FAFAFA] disabled:text-[#9A9A9A]",
      variante === "gestrichelt" && "border border-dashed border-[#ee7202] bg-white text-[#B35300] hover:bg-[#FFF7ED]",
      className,
    )}
    {...rest}
  >
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
));
SigButton.displayName = "SigButton";

/** UNTERZEICHNER · PROTOKOLL · STAND */
export function Abschnitt({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#595959]", className)}>{children}</div>
  );
}

/** Weiße Karte, 1 px #E5E5E5, Radius 12. */
export function Karte({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-[#E5E5E5] bg-white", className)} {...rest} />;
}

/** Feldbeschriftung (fett, klein). */
export function FeldLabel({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-[13px] font-semibold text-[#2B2B2B]", className)}>
      {children}
    </label>
  );
}

/** Eingabefeld-Klassen passend zum Mockup (44 px, Rand #D6D6D6, Radius 8). */
export const eingabeKlasse =
  "h-11 w-full rounded-lg border border-[#D6D6D6] bg-white px-3 text-[14px] text-[#2B2B2B] outline-none focus:border-[#ee7202] focus:ring-1 focus:ring-[#ee7202]";

/** Nummernkreis für Unterzeichner. */
export function NummerKreis({ n, dunkel, farbe }: { n: number; dunkel?: boolean; farbe?: string }) {
  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold"
      style={
        dunkel
          ? { backgroundColor: "#2B2B2B", color: "#fff" }
          : { backgroundColor: farbe ? farbe + "22" : "#FFF7ED", color: farbe ?? "#B35300" }
      }
    >
      {n}
    </span>
  );
}

/** Farben für Unterzeichner-Felder im Dokument (Nummer 1, 2, 3 …). */
export const SIGNER_FARBEN = ["#ee7202", "#2F6FB5", "#2E8B57", "#8E44AD", "#C0392B", "#16A085", "#7F8C8D"];
