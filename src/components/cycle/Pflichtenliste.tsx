import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BundledDuty, usePinDutyAsNote } from '@/hooks/useAnnualCycle';

interface PflichtenlisteProps {
  buendel: BundledDuty[];
  alleOffen: number;
  isLoading?: boolean;
}

/**
 * Die rechte Leiste: alle offenen Pflichten.
 *
 * Gebündelt — eine Pflicht über 23 Gebäude wird zu EINER Karte mit 23
 * Unterpunkten. Sonst wären es 23 Zettel für eine einzige Tätigkeit.
 *
 * Hier wird nichts nach Monat gefiltert. Was dran ist, entscheidet nicht der
 * Kalender, sondern der, der es macht.
 */
export function Pflichtenliste({ buendel, alleOffen, isLoading }: PflichtenlisteProps) {
  const pinDuty = usePinDutyAsNote();

  return (
    <aside className="flex w-full flex-col rounded-[11px] border border-border bg-card p-4 lg:w-[340px] lg:shrink-0">
      <h2 className="text-[15px] font-semibold text-foreground">Offene Pflichten</h2>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        {buendel.length} {buendel.length === 1 ? 'Pflicht' : 'Pflichten'} · {alleOffen} offene
        Zeilen
      </p>

      <div className="mt-4 flex-1 space-y-2">
        {isLoading && (
          <>
            <Skeleton className="h-[64px] w-full" />
            <Skeleton className="h-[64px] w-full" />
            <Skeleton className="h-[64px] w-full" />
          </>
        )}

        {!isLoading && buendel.length === 0 && (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            Nichts offen — alles erledigt oder schon an einer Wand.
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
                  {b.zeilen.length} Gebäude
                  {b.zeilen.length > 1 && ` · als ein Zettel mit ${b.zeilen.length} Punkten`}
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

      <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
        Nichts hiervon wandert von selbst auf die Wand. Du nimmst dir, was du machen willst — ein
        Termin steht erst auf dem Zettel, wenn du ihn setzt.
      </p>
    </aside>
  );
}
