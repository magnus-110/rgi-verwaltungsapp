/**
 * Bausteine für Listen im Eigentümerportal (Mehr, Einstellungen):
 * Abschnittsüberschrift, Karte und Zeile mit Symbol – im Stil der Startseite.
 */
import { ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const PortalAbschnitt = ({ titel, children, className }: { titel?: string; children: React.ReactNode; className?: string }) => (
  <section className={className}>
    {titel && (
      <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80 px-1 mb-2">
        {titel}
      </h2>
    )}
    <div className="bg-card rounded-[14px] border border-border/60 overflow-hidden shadow-sm divide-y divide-foreground/[0.055]">
      {children}
    </div>
  </section>
);

interface ZeileProps {
  icon?: React.ComponentType<{ className?: string }>;
  titel: React.ReactNode;
  untertitel?: React.ReactNode;
  rechts?: React.ReactNode;
  onClick?: () => void;
  gefahr?: boolean;
  pfeil?: boolean;
  "data-tour"?: string;
}

export const PortalZeile = ({ icon: Icon, titel, untertitel, rechts, onClick, gefahr, pfeil = true, ...rest }: ZeileProps) => {
  const inhalt = (
    <>
      {Icon && (
        <span className={cn("h-9 w-9 rounded-[10px] flex items-center justify-center shrink-0", gefahr ? "bg-destructive/10" : "bg-primary/10")}>
          <Icon className={cn("h-[18px] w-[18px]", gefahr ? "text-destructive" : "text-primary")} />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className={cn("block text-[15px] font-medium leading-tight", gefahr ? "text-destructive" : "text-foreground")}>{titel}</span>
        {untertitel && <span className="block text-[13px] text-muted-foreground mt-0.5 truncate">{untertitel}</span>}
      </span>
      {rechts}
      {onClick && pfeil && !rechts && <ChevronRight className="h-[18px] w-[18px] text-muted-foreground/50 shrink-0" />}
    </>
  );
  const klasse = "w-full flex items-center gap-3.5 px-4 py-2.5 min-h-[60px] text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(klasse, "transition-colors hover:bg-muted/40 active:bg-muted/60")} data-tour={rest["data-tour"]}>
      {inhalt}
    </button>
  ) : (
    <div className={klasse} data-tour={rest["data-tour"]}>{inhalt}</div>
  );
};

export const PortalSeitenkopf = ({ titel, text, rechts }: { titel: string; text?: string; rechts?: React.ReactNode }) => (
  <div className="flex items-start gap-3 pt-1">
    <div className="flex-1 min-w-0 space-y-1">
      <h1 className="font-display text-2xl font-semibold text-foreground leading-tight tracking-tight">{titel}</h1>
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
    {rechts}
  </div>
);

/** Blatt von unten (Handy) für Unterseiten der Einstellungen – Kopf, scrollbarer Inhalt, fester Fuß. */
export const PortalBlatt = ({
  offen,
  onOffen,
  titel,
  text,
  children,
  fuss,
}: {
  offen: boolean;
  onOffen: (o: boolean) => void;
  titel: string;
  text?: string;
  children: React.ReactNode;
  fuss?: React.ReactNode;
}) => (
  <Sheet open={offen} onOpenChange={onOffen}>
    <SheetContent side="bottom" className="h-[92dvh] p-0 rounded-t-[20px] flex flex-col bg-background gap-0 border-0">
      <div className="bg-card border-b border-border/60 rounded-t-[20px] px-4 pt-2.5 pb-3.5">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25" aria-hidden="true" />
        <div className="max-w-xl mx-auto pr-8">
          <SheetTitle className="font-display text-lg font-semibold text-foreground leading-tight">{titel}</SheetTitle>
          {text ? (
            <SheetDescription className="text-[13px] text-muted-foreground mt-1">{text}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{titel}</SheetDescription>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 py-5 space-y-5">{children}</div>
      </div>
      {fuss && (
        <div className="bg-card border-t border-border/60 px-4 pt-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <div className="max-w-xl mx-auto">{fuss}</div>
        </div>
      )}
    </SheetContent>
  </Sheet>
);

/** Gruppe von Eingabefeldern mit kleiner Überschrift. */
export const PortalGruppe = ({ titel, hinweis, children }: { titel?: string; hinweis?: React.ReactNode; children: React.ReactNode }) => (
  <section>
    {titel && (
      <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.6px] text-muted-foreground/80 px-1 mb-2">{titel}</h3>
    )}
    <div className="bg-card rounded-[14px] border border-border/60 shadow-sm p-4 space-y-3.5">{children}</div>
    {hinweis && <p className="text-xs text-muted-foreground px-1 mt-2 leading-relaxed">{hinweis}</p>}
  </section>
);

/** Einheitliche Eingabe-Optik im Portal. */
export const portalFeld = "h-12 text-base rounded-[10px] bg-background";
