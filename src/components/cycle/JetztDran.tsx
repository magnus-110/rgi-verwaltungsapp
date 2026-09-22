import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BundledDuty, usePinDutyAsNote } from '@/hooks/useAnnualCycle';
import { formatDateDe } from '@/hooks/useBoardPins';

interface JetztDranProps {
  buendel: BundledDuty[];
  alleOffen: number;
  isLoading?: boolean;
  onZeitfenster: () => void;
}

/**
 * Die rechte Leiste „Jetzt dran".
 *
 * Gebündelt: Eine Pflicht über 23 Gebäude wird zu EINER Karte mit 23
 * Unterpunkten. Sonst wären es 23 Zettel für eine einzige Tätigkeit.
 */
export function JetztDran({ buendel, alleOffen, isLoading, onZeitfenster }: JetztDranProps) {
  const pinDuty = usePinDutyAsNote();
  const imFenster = buendel.reduce((n, b) => n + b.zeilen.length, 0);

  return (
    <aside className="flex w-full flex-col rounded-[11px] border border-border bg-card p-4 lg:w-[340px] lg:shrink-0">
      <h2 className="text-[15px] font-semibold text-foreground">Jetzt dran</h2>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        {imFenster} von {alleOffen} offenen Zeilen liegen im Zeitfenster
      </p>

      <div className="mt-4 flex-1 space-y-2">
        {isLoading && (
          <>
            <Skeleton className="h-[64px] w-full" />
            <Skeleton className="h-[64px] w-full" />
          </>
        )}

        {!isLoading && buendel.length === 0 && (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Gerade liegt nichts im Zeitfenster.
          </p>
        )}

        {!isLoading &&
          buendel.map(b => (
            <div
              key={b.taskKey}
              className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium leading-snug text-foreground">
                  {b.label}
                </div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {b.zeilen.length} {b.zeilen.length === 1 ? 'Gebäude' : 'Gebäude'}
                  {b.zeilen.length > 1 && ` · als ein Zettel mit ${b.zeilen.length} Punkten`}
                  {b.fensterBis && ` · bis ${formatDateDe(b.fensterBis)}`}
                </div>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                disabled={pinDuty.isPending}
                onClick={() => pinDuty.mutate(b)}
                aria-label={`„${b.label}" auf meine Wand heften`}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Je Pflicht ein Zeitfenster: ab welchem Monat nach Ende des Wirtschaftsjahres sie relevant
          wird. Fünfzehn Zahlen, einmal festgelegt — danach sortiert sich diese Spalte allein.
        </p>
        <Button variant="outline" className="mt-2.5 w-full" onClick={onZeitfenster}>
          Zeitfenster bearbeiten
        </Button>
      </div>
    </aside>
  );
}
