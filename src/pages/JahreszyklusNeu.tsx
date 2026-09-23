import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { buildFiscalYears } from '@/lib/annualCycle';
import { useAuth } from '@/hooks/useAuth';
import {
  CycleBuilding,
  CycleTask,
  useCycleBuildings,
  useCycleDefinitions,
  useCycleTasks,
  useMyCyclePins,
  usePinCycleTask,
  useSetCycleStatus,
} from '@/hooks/useAnnualCycle';
import { CycleMatrix } from '@/components/cycle/CycleMatrix';

/** Die Monatsnamen für die Überschrift eines Blocks. */
const MONAT = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function variantenSchluessel(b: CycleBuilding) {
  return `${b.startMonth}-${b.startDay}`;
}

function variantenName(startMonth: number, startDay: number) {
  if (startMonth === 1 && startDay === 1) return 'Kalenderjahr';
  return `Wirtschaftsjahr ab ${startDay}. ${MONAT[startMonth - 1]}`;
}

/**
 * Der Jahreszyklus.
 *
 * Ein Block je Wirtschaftsjahr-Variante. Sieben der dreiundzwanzig Häuser
 * rechnen nicht nach dem Kalenderjahr ab, in vier verschiedenen Varianten —
 * ein einziger Jahresumschalter für alle wäre schlicht falsch, weil es das
 * eine Jahr nicht gibt.
 *
 * Gearbeitet wird in der Zelle: Stand setzen oder sie auf die eigene Wand
 * holen. Angeheftet wird die Zeile selbst, keine Kopie — was auf der Wand
 * abgehakt wird, steht hier sofort auf grün.
 */
export default function JahreszyklusNeu() {
  const { user } = useAuth();

  const { data: definitionen = [], isLoading: defLoading } = useCycleDefinitions();
  const { data: buildings = [], isLoading: bLoading } = useCycleBuildings();
  const { data: tasks = [], isLoading: tLoading } = useCycleTasks();
  const { data: anMeinerWand = new Set<string>() } = useMyCyclePins(user?.id);

  const setStatus = useSetCycleStatus();
  const pinTask = usePinCycleTask();

  /** Welches Jahr ist je Variante gewählt? Schlüssel ist die Variante. */
  const [gewaehlt, setGewaehlt] = useState<Record<string, string>>({});

  /** Die Gebäude nach Wirtschaftsjahr gruppiert, Kalenderjahr zuerst. */
  const bloecke = useMemo(() => {
    const map = new Map<string, CycleBuilding[]>();
    buildings.forEach(b => {
      const k = variantenSchluessel(b);
      map.set(k, [...(map.get(k) || []), b]);
    });

    return Array.from(map.entries())
      .map(([k, haeuser]) => {
        const [m, t] = k.split('-').map(Number);
        return {
          key: k,
          startMonth: m,
          startDay: t,
          name: variantenName(m, t),
          haeuser,
          jahre: buildFiscalYears(new Date().getFullYear(), { startMonth: m, startDay: t }),
        };
      })
      .sort((a, b) =>
        a.startMonth === b.startMonth ? a.startDay - b.startDay : a.startMonth - b.startMonth
      );
  }, [buildings]);

  const tasksNach = useMemo(() => {
    const map = new Map<string, CycleTask[]>();
    tasks.forEach(t => {
      const k = `${t.building_id}:${t.fiscal_year_start}`;
      map.set(k, [...(map.get(k) || []), t]);
    });
    return map;
  }, [tasks]);

  const laedt = defLoading || bLoading || tLoading;

  if (laedt) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[17px] font-semibold text-foreground">Jahreszyklus</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          {definitionen.length} Pflichten je Gebäude und Wirtschaftsjahr · {buildings.length} Gebäude
          in {bloecke.length} {bloecke.length === 1 ? 'Variante' : 'Varianten'}
        </p>
      </div>

      {bloecke.map(block => {
        // Standardjahr: das mittlere der fünf, also das laufende.
        const standard = block.jahre[2]?.start ?? block.jahre[0]?.start ?? '';
        const jahrStart = gewaehlt[block.key] ?? standard;

        const blockTasks = block.haeuser.flatMap(
          h => tasksNach.get(`${h.id}:${jahrStart}`) ?? []
        );
        const erledigt = blockTasks.filter(t => t.status === 'done').length;
        const inArbeit = blockTasks.filter(t => t.status === 'in_progress').length;
        const gesamt = block.haeuser.length * definitionen.length;

        return (
          <section key={block.key} className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h2 className="text-[14.5px] font-semibold text-foreground">{block.name}</h2>
                <p className="text-[12px] text-muted-foreground">
                  {block.haeuser.length} {block.haeuser.length === 1 ? 'Gebäude' : 'Gebäude'} ·{' '}
                  {erledigt} von {gesamt} erledigt
                  {inArbeit > 0 && ` · ${inArbeit} in Arbeit`}
                </p>
              </div>

              <div className="ml-auto inline-flex rounded-lg bg-muted p-1">
                {block.jahre.slice(1, 4).map(j => (
                  <button
                    key={j.start}
                    type="button"
                    onClick={() => setGewaehlt(g => ({ ...g, [block.key]: j.start }))}
                    className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                      jahrStart === j.start
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    WJ {j.label}
                  </button>
                ))}
              </div>
            </div>

            {blockTasks.length === 0 ? (
              <p className="rounded-[11px] border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
                Für dieses Wirtschaftsjahr ist noch nichts angelegt.
              </p>
            ) : (
              <CycleMatrix
                definitionen={definitionen}
                buildings={block.haeuser}
                tasks={blockTasks}
                anMeinerWand={anMeinerWand}
                onStatus={(taskId, status) => setStatus.mutate({ taskId, status })}
                onPin={(t, titel) =>
                  user && pinTask.mutate({ taskId: t.id, userId: user.id, titel })
                }
              />
            )}
          </section>
        );
      })}

      <p className="border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
        Ein Klick auf einen Punkt setzt den Stand oder holt genau diese Pflicht für dieses Haus auf
        deine Wand. Was du dort abhakst, steht hier sofort auf grün.
      </p>
    </div>
  );
}
