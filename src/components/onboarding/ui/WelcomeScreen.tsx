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
    <div className="max-w-md mx-auto space-y-6 py-2">
      <div className="space-y-4">
        <h1 className="font-display text-[28px] leading-[1.15] text-foreground">
          Herzlich willkommen
          <br />
          bei <span className="text-primary">RGI Immobilien!</span>
        </h1>
        <div className="space-y-3 text-[14px] leading-relaxed text-foreground/80">
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

      <div className="bg-card rounded-[14px] border border-border/60 px-4 py-3">
        <div className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase mb-2">
          Was Sie erwartet
        </div>
        <ul className="divide-y divide-foreground/[0.055]">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const isFirst = n === 1;
            return (
              <li key={n} className="flex items-center gap-3 py-2.5">
                <span
                  className={cn(
                    "size-7 shrink-0 rounded-full grid place-items-center text-[12px] font-semibold",
                    isFirst
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/70 bg-background text-muted-foreground"
                  )}
                >
                  {n}
                </span>
                <span className="flex-1 text-[14px] text-foreground font-medium">
                  {s.name}
                </span>
                <span
                  className={cn(
                    "text-[11px] px-2.5 py-0.5 rounded-full font-medium",
                    s.required
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {s.required ? "Pflicht" : "Optional"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <Button onClick={onStart} className="w-full h-12 text-[15px]">
          Jetzt starten
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Ihre Daten werden sicher gespeichert
        </p>
      </div>
    </div>
  );
};
