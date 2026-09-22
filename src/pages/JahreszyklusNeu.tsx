import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { buildFiscalYears } from '@/lib/annualCycle';
import { useFiscalYearContext } from '@/contexts/FiscalYearContext';
import {
  useCycleDefinitions,
  useCycleMatrix,
  useDutiesDueNow,
} from '@/hooks/useAnnualCycle';
import { CycleMatrix } from '@/components/cycle/CycleMatrix';
import { JetztDran } from '@/components/cycle/JetztDran';
import { ZeitfensterDialog } from '@/components/cycle/ZeitfensterDialog';

/**
 * Der Jahreszyklus (Screen 7 des Entwurfs).
 *
 * Die Matrix bleibt Übersicht. Aufgaben entstehen hier nicht von selbst —
 * rechts steht, was im Zeitfenster liegt, und nur von dort holt man sich
 * etwas auf die Wand.
 */
export default function JahreszyklusNeu() {
  const fyCtx = useFiscalYearContext();
  const fiscalYears = useMemo(() => buildFiscalYears(), []);

  const start =
    (fyCtx.globalFiscalYear != null &&
      fiscalYears.find(f => Number(f.label) === fyCtx.globalFiscalYear)) ||
    fiscalYears[2];

  const [gewaehlt, setGewaehlt] = useState(start);
  const [zeitfensterOffen, setZeitfensterOffen] = useState(false);

  const { data: definitionen = [], isLoading: defLoading } = useCycleDefinitions();
  const { data: matrix, isLoading: matrixLoading } = useCycleMatrix(gewaehlt.start);
  const { buendel, isLoading: dutiesLoading, alleOffen } = useDutiesDueNow();

  const buildings = matrix?.buildings ?? [];
  const tasks = matrix?.tasks ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[17px] font-semibold text-foreground">Jahreszyklus</h1>
        <div className="inline-flex rounded-lg bg-muted p-1">
          {fiscalYears.slice(1, 4).map(f => (
            <button
              key={f.start}
              type="button"
              onClick={() => {
                setGewaehlt(f);
                const y = Number(f.label);
                if (Number.isFinite(y)) fyCtx.setGlobalFiscalYear(y);
              }}
              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                gewaehlt.start === f.start
                  ? 'bg-background font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              WJ {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[13.5px] font-medium text-foreground">
          {definitionen.length} Pflichten × {buildings.length} Gebäude
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Die Matrix bleibt Übersicht. Aufgaben entstehen hier nicht von selbst.
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {defLoading || matrixLoading ? (
            <Skeleton className="h-[520px] w-full" />
          ) : (
            <CycleMatrix definitionen={definitionen} buildings={buildings} tasks={tasks} />
          )}
        </div>

        <JetztDran
          buendel={buendel}
          alleOffen={alleOffen}
          isLoading={dutiesLoading}
          onZeitfenster={() => setZeitfensterOffen(true)}
        />
      </div>

      <ZeitfensterDialog
        open={zeitfensterOffen}
        onOpenChange={setZeitfensterOffen}
        definitionen={definitionen}
      />
    </div>
  );
}
