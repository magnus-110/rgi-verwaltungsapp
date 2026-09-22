import { useMemo } from 'react';
import { CycleDefinition } from '@/hooks/useAnnualCycle';

type Zellzustand = 'erledigt' | 'offen' | 'keine';

interface TaskZeile {
  id: string;
  building_id: string;
  task_key: string;
  status: string;
}

interface CycleMatrixProps {
  definitionen: CycleDefinition[];
  buildings: { id: string; name: string }[];
  tasks: TaskZeile[];
  onCellClick?: (taskId: string) => void;
}

function kuerze(name: string, max = 11) {
  const erstes = name.split(/[\s,]+/)[0];
  return erstes.length > max ? erstes.slice(0, max - 1) + '.' : erstes;
}

function zustand(t: TaskZeile | undefined): Zellzustand {
  if (!t) return 'keine';
  return t.status === 'done' ? 'erledigt' : 'offen';
}

const ZUSTAND_TITEL: Record<Zellzustand, string> = {
  erledigt: 'erledigt',
  offen: 'offen',
  keine: 'nicht angelegt',
};

function Zelle({ art }: { art: Zellzustand }) {
  if (art === 'keine') {
    return <span className="block h-[3px] w-[14px] rounded-sm bg-[#E0DCD4]" />;
  }
  if (art === 'erledigt') {
    return <span className="block h-[15px] w-[15px] rounded-full bg-[#6B8A55]" />;
  }
  return <span className="block h-[15px] w-[15px] rounded-full border-2 border-[#C2BBAE]" />;
}

/**
 * Die Matrix (Screen 7 des Entwurfs).
 *
 * Zeilen sind die Pflichten, Spalten die Gebäude — so herum, weil man eine
 * Pflicht über alle Häuser betrachtet, nicht ein Haus über alle Pflichten.
 */
export function CycleMatrix({ definitionen, buildings, tasks, onCellClick }: CycleMatrixProps) {
  const nachSchluessel = useMemo(() => {
    const map = new Map<string, TaskZeile>();
    tasks.forEach(t => map.set(`${t.task_key}:${t.building_id}`, t));
    return map;
  }, [tasks]);

  return (
    <div className="rounded-[11px] border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[214px] min-w-[214px] bg-card px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pflicht
              </th>
              {buildings.map(b => (
                <th
                  key={b.id}
                  className="w-[62px] min-w-[62px] px-1 py-2.5 text-center text-[11px] font-medium text-muted-foreground"
                  title={b.name}
                >
                  {kuerze(b.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {definitionen.map(d => (
              <tr key={d.task_key} className="border-t border-border/60">
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[13px] font-normal text-foreground">
                  {d.label}
                </th>
                {buildings.map(b => {
                  const t = nachSchluessel.get(`${d.task_key}:${b.id}`);
                  const art = zustand(t);
                  return (
                    <td key={b.id} className="px-1 py-2">
                      <button
                        type="button"
                        disabled={!t || !onCellClick}
                        onClick={() => t && onCellClick?.(t.id)}
                        className="mx-auto flex h-[22px] w-full items-center justify-center disabled:cursor-default"
                        title={`${d.label} · ${b.name} · ${ZUSTAND_TITEL[art]}`}
                        aria-label={`${d.label}, ${b.name}: ${ZUSTAND_TITEL[art]}`}
                      >
                        <Zelle art={art} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-3 py-2.5 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Zelle art="erledigt" /> erledigt
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Zelle art="offen" /> offen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Zelle art="keine" /> nicht angelegt
        </span>
      </div>
    </div>
  );
}
