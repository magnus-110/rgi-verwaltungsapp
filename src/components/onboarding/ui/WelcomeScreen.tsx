import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WelcomeScreenProps {
  onStart: () => void;
}

const STEPS: { name: string; required: boolean }[] = [
  { name: "Stammdaten", required: true },
  { name: "Wohnungsdaten", required: false },
  { name: "Gebäude", required: false },
  { name: "Dienstleister", required: false },
  { name: "Einschätzung", required: false },
];

export const WelcomeScreen = ({ onStart }: WelcomeScreenProps) => {
  return (
    <div className="max-w-md mx-auto space-y-7 py-3">
      <div className="bg-card rounded-[16px] border border-border/50 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="h-1 bg-primary" />
        <div className="px-5 py-5 space-y-5">
          <h1 className="font-display !font-normal text-[28px] leading-[1.2] tracking-[-0.01em] text-foreground">
            Herzlich willkommen
            <br />
            bei <span className="text-primary font-medium">RGI Immobilien!</span>
          </h1>
          <div className="space-y-3.5 text-[14px] leading-[1.7] text-foreground/75">
            <p>
              Wir freuen uns sehr, Sie als Eigentümer begrüßen zu dürfen, und
              danken Ihnen herzlich für das Vertrauen, das Sie uns mit der
              Verwaltung Ihrer WEG entgegenbringen.
            </p>
            <p>
              Bitte vervollständigen Sie in den folgenden Schritten Ihre
              persönlichen Stammdaten. Der Vorgang dauert nur wenige Minuten und
              kann jederzeit unterbrochen werden.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-[16px] border border-border/50 px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/80 uppercase mb-3">
          Was Sie erwartet
        </div>
        <ul className="divide-y divide-border/40">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const isFirst = n === 1;
            return (
              <li key={n} className="flex items-center gap-3.5 py-3 first:pt-1 last:pb-1">
                <span
                  className={cn(
                    "size-7 shrink-0 rounded-full grid place-items-center text-[12px] font-semibold transition-colors",
                    isFirst
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground"
                  )}
                >
                  {n}
                </span>
                <span className="flex-1 text-[14px] text-foreground font-medium">
                  {s.name}
                </span>
                <span
                  className={cn(
                    "text-[10.5px] px-2.5 py-1 rounded-full font-semibold tracking-wide uppercase",
                    s.required
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary text-muted-foreground"
                  )}
                >
                  {s.required ? "Pflicht" : "Optional"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2.5">
        <Button
          onClick={onStart}
          className="w-full h-12 text-[15px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-[12px] shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.4)]"
        >
          Jetzt starten
        </Button>
        <p className="text-center text-[11px] text-muted-foreground/80">
          Ihre Daten werden sicher gespeichert
        </p>
      </div>
    </div>
  );
};
