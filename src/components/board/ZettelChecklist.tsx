import { useState, useMemo } from 'react';
import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useSubtasks,
  useToggleSubtask,
  useCreateSubtask,
  useDeleteSubtask,
  TodoSubtask,
} from '@/hooks/useTodos';
import { initialsOf } from '@/hooks/useBoardPins';
import { cn } from '@/lib/utils';

/** Die beiden Spalten stehen noch nicht in der generierten types.ts. */
type SubtaskMitAnleitung = TodoSubtask & {
  description?: string | null;
  template_step_id?: string | null;
};

interface ZettelChecklistProps {
  todoId: string;
  /** Name der Anleitung, aus der die Punkte stammen. */
  templateName?: string | null;
}

function kurzDatum(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + '.';
}

/**
 * Die Checkliste auf der Aufgabe (Screen 3 des Entwurfs).
 *
 * Der erste noch offene Punkt steht aufgeklappt da, samt Anleitungstext —
 * sonst schlägt niemand nach, und die Anleitung nützt nichts.
 */
export function ZettelChecklist({ todoId, templateName }: ZettelChecklistProps) {
  const { data: rohe = [], isLoading } = useSubtasks(todoId);
  const subtasks = rohe as SubtaskMitAnleitung[];
  const toggle = useToggleSubtask();
  const createSubtask = useCreateSubtask();
  const deleteSubtask = useDeleteSubtask();

  const [neu, setNeu] = useState('');
  /** Punkte, deren Anleitung der Benutzer von Hand auf- oder zugeklappt hat. */
  const [manuell, setManuell] = useState<Record<string, boolean>>({});

  const erledigt = subtasks.filter(s => s.is_completed).length;
  const gesamt = subtasks.length;

  // Der erste offene Punkt ist standardmäßig aufgeklappt.
  const ersterOffener = useMemo(
    () => subtasks.find(s => !s.is_completed)?.id ?? null,
    [subtasks]
  );

  const istOffen = (s: SubtaskMitAnleitung) =>
    manuell[s.id] ?? (s.id === ersterOffener && !!s.description);

  if (isLoading) {
    return <div className="text-[13px] text-muted-foreground">Checkliste wird geladen …</div>;
  }

  return (
    <div className="rounded-[11px] border border-border bg-card p-4 lg:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-foreground">Checkliste</h2>
        {templateName && (
          <span className="text-[12.5px] text-muted-foreground">
            aus der Anleitung <span className="font-medium text-foreground">{templateName}</span>
          </span>
        )}
        {gesamt > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <div className="h-[6px] w-[150px] overflow-hidden rounded-full bg-muted sm:w-[190px]">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(erledigt / gesamt) * 100}%` }}
              />
            </div>
            <span className="text-[12.5px] text-muted-foreground">
              {erledigt} / {gesamt}
            </span>
          </div>
        )}
      </div>

      {gesamt === 0 && (
        <p className="mb-3 text-[13px] text-muted-foreground">
          Noch keine Punkte. Du kannst unten welche hinzufügen oder rechts eine Anleitung übernehmen.
        </p>
      )}

      <div className="space-y-1">
        {subtasks.map(s => {
          const offen = istOffen(s);
          return (
            <div
              key={s.id}
              className={cn(
                'group rounded-lg',
                offen && !s.is_completed
                  ? 'border border-[#F3CBA0] bg-[#FFFBF3] p-3'
                  : 'px-2 py-2 hover:bg-muted/50'
              )}
            >
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    toggle.mutate({ id: s.id, todoId, isCompleted: !s.is_completed })
                  }
                  aria-label={s.is_completed ? 'Haken entfernen' : 'Abhaken'}
                  className={cn(
                    'mt-[1px] flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded border transition-colors',
                    s.is_completed
                      ? 'border-[#6B8A55] bg-[#6B8A55] text-white'
                      : 'border-[#C2BBAE] bg-background hover:border-primary'
                  )}
                >
                  {s.is_completed && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>

                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[13.5px] leading-snug',
                      s.is_completed
                        ? 'text-muted-foreground line-through'
                        : 'font-medium text-foreground'
                    )}
                  >
                    {s.title}
                  </span>

                  {offen && s.description && (
                    <p className="mt-1.5 text-[12.5px] leading-[1.55] text-muted-foreground">
                      {s.description}
                    </p>
                  )}
                </div>

                {s.is_completed && s.completed_user && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="flex h-[20px] w-[20px] items-center justify-center rounded-full bg-[#2B2B2B] text-[9px] font-semibold text-white">
                      {initialsOf(s.completed_user.first_name, s.completed_user.last_name)}
                    </span>
                    <span className="text-[11.5px] text-muted-foreground">
                      {kurzDatum(s.completed_at)}
                    </span>
                  </span>
                )}

                {!s.is_completed && s.description && (
                  <button
                    type="button"
                    onClick={() => setManuell(m => ({ ...m, [s.id]: !offen }))}
                    className="shrink-0 whitespace-nowrap text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    {offen ? (
                      <span className="inline-flex items-center gap-0.5">
                        Anleitung einklappen <ChevronUp className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5">
                        Anleitung <ChevronDown className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => deleteSubtask.mutate({ id: s.id, todoId })}
                  aria-label={`Punkt "${s.title}" löschen`}
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>

              {offen && !s.is_completed && s.description && (
                <div className="mt-3 flex gap-2 pl-[29px]">
                  <Button
                    size="sm"
                    onClick={() => toggle.mutate({ id: s.id, todoId, isCompleted: true })}
                  >
                    Abhaken
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setManuell(m => ({ ...m, [s.id]: false }))}
                  >
                    Anleitung einklappen
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <Input
          placeholder="Punkt hinzufügen …"
          value={neu}
          onChange={e => setNeu(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && neu.trim()) {
              createSubtask.mutate({ todoId, title: neu.trim() });
              setNeu('');
            }
          }}
          className="h-9 text-[13px]"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!neu.trim() || createSubtask.isPending}
          onClick={() => {
            createSubtask.mutate({ todoId, title: neu.trim() });
            setNeu('');
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
