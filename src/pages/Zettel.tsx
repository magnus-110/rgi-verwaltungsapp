import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useTodo } from '@/hooks/useTodos';
import { TodoComments } from '@/components/todos/TodoComments';
import { TodoAttachments } from '@/components/todos/TodoAttachments';
import { TodoDialog } from '@/components/todos/TodoDialog';
import { ZettelChecklist } from '@/components/board/ZettelChecklist';
import { useChecklistTemplates, useApplyChecklistTemplate } from '@/hooks/useChecklistTemplates';
import { useWallPeople, usePinsForRef } from '@/hooks/useBoardWalls';
import { useAlsoPinToWall } from '@/hooks/useBoardHandover';
import { HandoverDialog, HandoverTarget } from '@/components/board/HandoverDialog';
import { useTaskReminders, useCreateReminder, useDeleteReminder } from '@/hooks/useTaskReminders';
import { usePinToWall, useUnpin, useCompleteNote, formatDateDe, daysSince } from '@/hooks/useBoardPins';

/**
 * Die einzelne Aufgabe (Screen 3 des Entwurfs).
 *
 * Links die Arbeit: Checkliste, Beschreibung, Anhänge, Zuruf.
 * Rechts der Zusammenhang: an welchen Wänden er hängt, wozu er gehört,
 * woran er erinnern soll.
 */
export default function Zettel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: todo, isLoading } = useTodo(id ?? null);
  const { data: templates = [] } = useChecklistTemplates();
  const { data: wallPeople = [] } = useWallPeople();
  const { data: pins = [] } = usePinsForRef('todo', id ?? null);
  const { data: reminders = [] } = useTaskReminders(id ?? null);

  const applyTemplate = useApplyChecklistTemplate();
  const alsoPin = useAlsoPinToWall();
  const pinToWall = usePinToWall();
  const unpin = useUnpin();
  const erledigen = useCompleteNote();
  const createReminder = useCreateReminder();
  const deleteReminder = useDeleteReminder();

  const [editOpen, setEditOpen] = useState(false);
  const [neueErinnerung, setNeueErinnerung] = useState('');
  const [erinnerungText, setErinnerungText] = useState('');
  const [erinnerungOffen, setErinnerungOffen] = useState(false);
  const [handoverTarget, setHandoverTarget] = useState<HandoverTarget | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!todo) {
    return (
      <div className="py-16 text-center">
        <p className="text-[15px] font-medium text-foreground">Diese Aufgabe gibt es nicht mehr.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/pinnwand')}>
          Zurück zur Pinnwand
        </Button>
      </div>
    );
  }

  const t = todo as any;
  const meinPin = pins.find(p => p.userId === user?.id);
  const andere = pins.filter(p => p.userId !== user?.id);
  const nochNichtAufgehaengt = wallPeople.filter(p => !pins.some(x => x.userId === p.userId));
  const templateName = templates.find(x => x.id === t.checklist_template_id)?.name ?? null;

  const gebaeude =
    t.buildings?.map((b: any) => b.building?.name).filter(Boolean).join(', ') ||
    t.building?.name ||
    null;

  return (
    <div className="space-y-4">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/pinnwand"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Pinnwand
        </Link>
        <h1 className="text-[17px] font-semibold text-foreground">{t.title}</h1>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Bearbeiten
          </Button>
          {meinPin ? (
            <Button variant="outline" size="sm" onClick={() => unpin.mutate(meinPin.pinId)}>
              Von meiner Wand nehmen
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={() => pinToWall.mutate({ refType: 'todo', refId: t.id })}
            >
              Auf meine Wand
            </Button>
          )}
          <Button
            size="sm"
            className="bg-[#6B8A55] text-white hover:bg-[#5c7849]"
            disabled={t.status === 'done' || erledigen.isPending}
            onClick={() =>
              erledigen.mutate(t.id, {
                // Erledigt heisst: weg von der Wand und zurueck zur Pinnwand.
                onSuccess: () => navigate('/pinnwand'),
              })
            }
          >
            {t.status === 'done' ? 'Ist erledigt' : 'Erledigt'}
          </Button>
        </div>
      </div>

      {/* Metazeile */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
        {gebaeude && <span>{gebaeude}</span>}
        {t.category?.name && (
          <>
            {gebaeude && <span>·</span>}
            <span className="rounded bg-muted px-2 py-0.5">{t.category.name}</span>
          </>
        )}
        <span>·</span>
        <span>{t.due_date ? `fällig ${formatDateDe(t.due_date)}` : 'kein Fälligkeitsdatum'}</span>
        {/*
          Gehört die Aufgabe zu einem Vorgang, steht das hier — und zwar
          anklickbar. Beim Erledigen landet sie von selbst in dessen Verlauf.
        */}
        {(t as any).case_id && (
          <>
            <span>·</span>
            <Link
              to={`/vorgaenge/${(t as any).case_id}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <FolderKanban className="h-3.5 w-3.5" />
              zum Vorgang
            </Link>
          </>
        )}
        {t.follow_up_at && (
          <>
            <span>·</span>
            <span>Wiedervorlage {formatDateDe(t.follow_up_at)}</span>
          </>
        )}
        <span>·</span>
        <span>#{t.task_number}</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Links */}
        <div className="min-w-0 flex-1 space-y-4">
          {t.description && (
            <div className="rounded-[11px] border border-border bg-card p-4 lg:p-5">
              <h2 className="mb-2 text-[15px] font-semibold text-foreground">Beschreibung</h2>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
                {t.description}
              </p>
            </div>
          )}

          <ZettelChecklist todoId={t.id} templateName={templateName} />

          <div className="rounded-[11px] border border-border bg-card p-4 lg:p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-foreground">Anhänge</h2>
            <TodoAttachments todo={todo} />
          </div>

          <div className="rounded-[11px] border border-border bg-card p-4 lg:p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-foreground">Zuruf</h2>
            <TodoComments todoId={t.id} />
          </div>
        </div>

        {/* Rechts */}
        <aside className="w-full space-y-4 lg:w-[340px] lg:shrink-0">
          <div className="rounded-[11px] border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Hängt an diesen Wänden
            </h3>
            {pins.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">
                An keiner Wand. Die Aufgabe liegt im Vorrat.
              </p>
            )}
            <div className="space-y-2">
              {pins.map(p => {
                const tage = daysSince(p.pinnedAt);
                return (
                  <div key={p.pinId} className="flex items-center gap-2">
                    <span className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#2B2B2B] text-[10px] font-semibold text-white">
                      {p.initials}
                    </span>
                    <span className="text-[13px] text-foreground">{p.name}</span>
                    <span className="ml-auto text-[11.5px] text-muted-foreground">
                      {tage === 0 ? 'seit heute' : `seit ${tage} Tagen`}
                    </span>
                  </div>
                );
              })}
            </div>

            {andere.length > 0 && (
              <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                Eine Aufgabe, mehrere Wände. Abhaken sieht der andere sofort.
              </p>
            )}

            {nochNichtAufgehaengt.length > 0 && (
              <div className="mt-3">
                <Select
                  value=""
                  onValueChange={v => {
                    const person = nochNichtAufgehaengt.find(p => p.userId === v);
                    if (!person) return;
                    setHandoverTarget({
                      item: {
                        refType: 'todo',
                        refId: t.id,
                        title: t.title,
                        context: gebaeude,
                        origin: 'ohne_termin',
                        dueDate: t.due_date ?? null,
                        followUpAt: t.follow_up_at ?? null,
                        createdAt: t.created_at ?? null,
                        progress: null,
                        alsoOn: [],
                      },
                      targetUserId: person.userId,
                      targetName: person.name,
                    });
                  }}
                >
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue placeholder="Auch bei … aufhängen" />
                  </SelectTrigger>
                  <SelectContent>
                    {nochNichtAufgehaengt.map(p => (
                      <SelectItem key={p.userId} value={p.userId}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="rounded-[11px] border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Anleitung
            </h3>
            {templateName ? (
              <p className="text-[13px] text-foreground">{templateName}</p>
            ) : (
              <Select
                value=""
                onValueChange={v =>
                  applyTemplate.mutate({ todoId: t.id, templateId: v, userId: user!.id })
                }
              >
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Anleitung übernehmen …" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(x => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="rounded-[11px] border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Erinnerung
            </h3>

            {reminders.length === 0 && !erinnerungOffen && (
              <p className="mb-2 text-[12.5px] text-muted-foreground">
                Keine. Eine Erinnerung meldet sich, ohne dass die Aufgabe bis dahin im Weg liegt.
              </p>
            )}

            <div className="space-y-2">
              {reminders.map(r => (
                <div
                  key={r.id}
                  className="flex items-start gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-foreground">
                      {r.note || 'Erinnerung'}
                    </div>
                    <div className="text-[11.5px] text-muted-foreground">
                      meldet sich am {formatDateDe(r.remind_at)}
                      {r.fired_at ? ' · bereits gemeldet' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteReminder.mutate({ id: r.id, todoId: t.id })}
                    aria-label="Erinnerung löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
            </div>

            {erinnerungOffen ? (
              <div className="mt-2 space-y-2">
                <Input
                  type="date"
                  value={neueErinnerung}
                  onChange={e => setNeueErinnerung(e.target.value)}
                  className="h-9 text-[13px]"
                />
                <Input
                  placeholder="Woran erinnern? (optional)"
                  value={erinnerungText}
                  onChange={e => setErinnerungText(e.target.value)}
                  className="h-9 text-[13px]"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!neueErinnerung}
                    onClick={() => {
                      createReminder.mutate({
                        todoId: t.id,
                        remindAt: neueErinnerung,
                        note: erinnerungText.trim() || null,
                      });
                      setNeueErinnerung('');
                      setErinnerungText('');
                      setErinnerungOffen(false);
                    }}
                  >
                    Setzen
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setErinnerungOffen(false)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setErinnerungOffen(true)}
                className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Erinnerung hinzufügen
              </button>
            )}
          </div>
        </aside>
      </div>

      <TodoDialog open={editOpen} onOpenChange={setEditOpen} todo={todo} mode="edit" />

      <HandoverDialog
        target={handoverTarget}
        modus="zusaetzlich"
        onCancel={() => setHandoverTarget(null)}
        onConfirm={(note, silent) => {
          if (handoverTarget) {
            alsoPin.mutate({
              item: handoverTarget.item,
              targetUserId: handoverTarget.targetUserId,
              targetName: handoverTarget.targetName,
              note,
              silent,
            });
          }
          setHandoverTarget(null);
        }}
      />
    </div>
  );
}
