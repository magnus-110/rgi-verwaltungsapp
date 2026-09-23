import { useMemo, useState } from 'react';
import { Check, Circle, Clock, Pin } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CYCLE_STATUS_LABEL,
  CycleBuilding,
  CycleDefinition,
  CycleStatus,
  CycleTask,
} from '@/hooks/useAnnualCycle';

interface CycleMatrixProps {
  definitionen: CycleDefinition[];
  buildings: CycleBuilding[];
  /** Nur die Zeilen dieses Blocks, also eines Wirtschaftsjahres. */
  tasks: CycleTask[];
  /** Welche Zeilen hängen schon an meiner Wand? */
  anMeinerWand: Set<string>;
  onStatus: (taskId: string, status: CycleStatus) => void;
  onPin: (task: CycleTask, titel: string) => void;
}

function kuerze(name: string, max = 11) {
  const erstes = name.split(/[\s,]+/)[0];
  return erstes.length > max ? erstes.slice(0, max - 1) + '.' : erstes;
}

/** Der Punkt in der Zelle. Grün erledigt, orange in Arbeit, leer offen. */
function Punkt({ status, angeheftet }: { status?: CycleStatus; angeheftet?: boolean }) {
  if (!status) return <span className="block h-[3px] w-[14px] rounded-sm bg-[#E0DCD4]" />;

  const grund =
    status === 'done'
      ? 'bg-[#6B8A55]'
      : status === 'in_progress'
        ? 'border-2 border-[#ee7202] bg-[#FFF7ED]'
        : 'border-2 border-[#C2BBAE]';

  return (
    <span className="relative block">
      <span className={`block h-[15px] w-[15px] rounded-full ${grund}`} />
      {angeheftet && (
        <span className="absolute -right-[3px] -top-[3px] block h-[6px] w-[6px] rounded-full bg-[#2B2B2B]" />
      )}
    </span>
  );
}

/**
 * Die Matrix eines Wirtschaftsjahres.
 *
 * Zeilen sind die Pflichten, Spalten die Gebäude — so herum, weil man eine
 * Pflicht über alle Häuser betrachtet, nicht ein Haus über alle Pflichten.
 *
 * Ein Klick auf eine Zelle setzt ihren Stand oder holt sie auf die Wand. Das
 * ist die kleinste Einheit, die es hier gibt: eine Pflicht, ein Haus, ein
 * Jahr.
 */
export function CycleMatrix({
  definitionen,
  buildings,
  tasks,
  anMeinerWand,
  onStatus,
  onPin,
}: CycleMatrixProps) {
  const [offeneZelle, setOffeneZelle] = useState<string | null>(null);

  const nachSchluessel = useMemo(() => {
    const map = new Map<string, CycleTask>();
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
                  const zellId = `${d.task_key}:${b.id}`;
                  const titel = `${d.label} — ${b.name}`;
                  const angeheftet = t ? anMeinerWand.has(t.id) : false;

                  if (!t) {
                    return (
                      <td key={b.id} className="px-1 py-2">
                        <span
                          className="mx-auto flex h-[22px] w-full items-center justify-center"
                          title={`${d.label} · ${b.name} · nicht angelegt`}
                        >
                          <Punkt />
                        </span>
                      </td>
                    );
                  }

                  return (
                    <td key={b.id} className="px-1 py-2">
                      <Popover
                        open={offeneZelle === zellId}
                        onOpenChange={o => setOffeneZelle(o ? zellId : null)}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="mx-auto flex h-[22px] w-full items-center justify-center rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            title={`${titel} · ${CYCLE_STATUS_LABEL[t.status]}`}
                            aria-label={`${titel}: ${CYCLE_STATUS_LABEL[t.status]} — ändern`}
                          >
                            <Punkt status={t.status} angeheftet={angeheftet} />
                          </button>
                        </PopoverTrigger>

                        <PopoverContent align="center" className="w-[228px] p-1.5">
                          <p className="px-2 py-1.5 text-[12px] leading-snug text-muted-foreground">
                            <span className="block font-medium text-foreground">{d.label}</span>
                            {b.name}
                          </p>

                          <div className="my-1 border-t border-border" />

                          {(['open', 'in_progress', 'done'] as CycleStatus[]).map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                onStatus(t.id, s);
                                setOffeneZelle(null);
                              }}
                              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted ${
                                t.status === s ? 'font-medium text-foreground' : 'text-muted-foreground'
                              }`}
                            >
                              {s === 'done' ? (
                                <Check className="h-3.5 w-3.5 text-[#6B8A55]" />
                              ) : s === 'in_progress' ? (
                                <Clock className="h-3.5 w-3.5 text-[#ee7202]" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              {CYCLE_STATUS_LABEL[s]}
                              {t.status === s && <span className="ml-auto text-[11px]">aktuell</span>}
                            </button>
                          ))}

                          <div className="my-1 border-t border-border" />

                          <button
                            type="button"
                            disabled={angeheftet}
                            onClick={() => {
                              onPin(t, titel);
                              setOffeneZelle(null);
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-muted disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent"
                          >
                            <Pin className="h-3.5 w-3.5" />
                            {angeheftet ? 'Hängt an deiner Wand' : 'Auf meine Wand'}
                          </button>
                        </PopoverContent>
                      </Popover>
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
          <Punkt status="done" /> erledigt
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Punkt status="in_progress" /> in Arbeit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Punkt status="open" /> offen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Punkt /> nicht angelegt
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Punkt status="open" angeheftet /> hängt an deiner Wand
        </span>
      </div>
    </div>
  );
}
