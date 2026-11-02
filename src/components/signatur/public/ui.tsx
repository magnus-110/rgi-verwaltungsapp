import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Farben laut Mockup / Übergabe Abschnitt 10. */
export const F = {
  linie: "#F08C1F",
  app: "#ee7202",
  akzent: "#B35300",
  text: "#2B2B2B",
  text2: "#595959",
  grau: "#6B6B6B",
  creme: "#FAFAFA",
  orangeBg: "#FFF7ED",
  gruenBg: "#D4EDDA",
  gruen: "#1E6B34",
  rand: "#E5E5E5",
};

export const LOGO = "/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png";
export const TELEFON = "08363 / 960656";

/** Überschriften: Century Gothic, sonst Questrial (wird nachgeladen). */
export const ueberschrift = "font-display font-semibold [font-family:'Century_Gothic','CenturyGothic',Questrial,Arial,sans-serif] tracking-[-0.012em] text-[#2B2B2B]";

/** Questrial als Ersatz für Century Gothic (z. B. Android) einmalig laden. */
export function useQuestrial() {
  useEffect(() => {
    const id = "rgi-questrial-font";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Questrial&display=swap";
    document.head.appendChild(l);
  }, []);
}

/** Heller Hintergrund, weiße Karte max. 430 px; auf dem Handy volle Breite. */
export function Rahmen({ children }: { children: ReactNode }) {
  useQuestrial();
  return (
    <div className="min-h-[100dvh] bg-[#F4F2EE] font-sans text-[#2B2B2B] [letter-spacing:0]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col bg-white min-[431px]:shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        {children}
      </div>
    </div>
  );
}

export function Kopf({ links, onZurueck }: { links?: "sicher" | "zurueck" | null; onZurueck?: () => void }) {
  return (
    <header className="shrink-0 border-b-[3px] border-[#F08C1F] bg-white">
      <div className="flex h-[60px] items-center justify-between pl-5 pr-5">
        {links === "sicher" && <span className="text-[12px] leading-none text-[#595959]">Sichere Unterschrift</span>}
        {links === "zurueck" && (
          <button type="button" onClick={onZurueck} className="-ml-1 px-1 py-2 text-[13.5px] leading-none text-[#B35300] hover:underline">
            ‹ Zurück
          </button>
        )}
        {!links && <span />}
        <img src={LOGO} alt="RGI Immobilien" className="h-[38px] w-auto select-none object-contain" draggable={false} />
      </div>
    </header>
  );
}

export function Fortschritt({ schritt }: { schritt: 1 | 2 | 3 }) {
  const labels = ["1 Lesen", "2 Unterschreiben", "3 Fertig"];
  return (
    <div className="grid grid-cols-3 gap-1.5 px-5 pt-[14px]">
      {labels.map((l, i) => {
        const nr = i + 1;
        return (
          <div key={l}>
            <div className={cn("h-1 rounded-full", nr <= schritt ? "bg-[#ee7202]" : "bg-[#E5E5E5]")} />
            <div className={cn("mt-[7px] text-[12px] leading-[14px]", nr === schritt ? "font-bold text-[#B35300]" : "text-[#6B6B6B]")}>{l}</div>
          </div>
        );
      })}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean };

export function PrimaerButton({ className, busy, children, disabled, ...p }: BtnProps) {
  return (
    <button
      type="button"
      {...p}
      disabled={disabled || busy}
      className={cn(
        "flex h-[50px] w-full items-center justify-center gap-2 rounded-[8px] bg-[#B35300] text-[16px] font-bold text-white transition-colors hover:bg-[#9c4800] disabled:cursor-not-allowed disabled:bg-[#E5E5E5] disabled:text-[15px] disabled:text-[#595959]",
        className,
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function SekundaerButton({ className, busy, children, disabled, ...p }: BtnProps) {
  return (
    <button
      type="button"
      {...p}
      disabled={disabled || busy}
      className={cn(
        "flex h-[50px] w-full items-center justify-center gap-2 rounded-[8px] border-2 border-[#B35300] bg-white text-[15px] font-bold text-[#B35300] transition-colors hover:bg-[#FFF7ED] disabled:opacity-50",
        className,
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** Unten fixierte Leiste mit Button (klebt am unteren Rand des Bildschirms). */
export function UntenLeiste({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 shrink-0 border-t border-[#EEEEEE] bg-white px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-[15px]">
      {children}
    </div>
  );
}

export function Fusszeile({ className }: { className?: string }) {
  return (
    <footer className={cn("px-5 pb-5 pt-6 text-center text-[10.5px] leading-[16px] text-[#8A8A8A]", className)}>
      RGI Immobilien GmbH &amp; Co. KG · Vilstalstr. 4 · 87459 Pfronten · Tel.{" "}
      <a href="tel:+498363960656" className="whitespace-nowrap">{TELEFON}</a> ·{" "}
      <a href="mailto:info@rgi-immobilien.de">info@rgi-immobilien.de</a>
    </footer>
  );
}

export function FehlerHinweis({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-[10px] border border-[#F3C9C2] bg-[#FDF1EF] px-[14px] py-3 text-[13px] leading-[19px] text-[#8A2A1C]">
      {children}
    </div>
  );
}

export function Haken({ className, strich = 3 }: { className?: string; strich?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strich} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
