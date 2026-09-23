import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Check, ChevronLeft, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  useTodo,
  usePatchTodo,
  useSetTodoBuildings,
  useSoftDeleteTodo,
  useCategories,
} from '@/hooks/useTodos';
import { TodoAttachments } from '@/components/todos/TodoAttachments';
import { ZettelChecklist } from '@/components/board/ZettelChecklist';
import { AufgabeBlatt } from '@/components/board/AufgabeBlatt';
import { useChecklistTemplates, useApplyChecklistTemplate } from '@/hooks/useChecklistTemplates';
import { usePinsForRef } from '@/hooks/useBoardWalls';
import { useTodoVerlauf, VerlaufEintrag } from '@/hooks/useTodoVerlauf';
import { useTaskReminders, useCreateReminder, useDeleteReminder } from '@/hooks/useTaskReminders';
import {
  usePinToWall,
  usePinToWalls,
  useUnpin,
  useCompleteNote,
  formatDateDe,
} from '@/hooks/useBoardPins';

const PRIO_TEXT: Record<string, string> = {
  low: 'niedrig',
  medium: 'mittel',
  high: 'hoch',
  urgent: 'dringend',
};

const WDH_TEXT: Record<string, string> = {
  daily: 'Tage',
  weekly: 'Wochen',
  monthly: 'Monate',
  yearly: 'Jahre',
};

function zeitpunkt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  );
}

/** Eine Zeile in der rechten Spalte: links die Frage, rechts die Antwort. */
function Zeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[38px] items-center gap-3 px-3">
      <span className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Ein unauffälliger Knopf für einen Wert in der rechten Spalte. */
function Wert({
  gesetzt,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { gesetzt: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] transition-colors hover:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        gesetzt ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Die einzelne Aufgabe.
 *
 * Oben das Blatt — dieselbe Fläche wie beim Schreiben, nur größer. Darunter
 * die Arbeit: Checkliste, Anhänge, Verlauf. Rechts das Kleingedruckte, das
 * aufs Blatt nicht gehört.
 *
 * Es gibt keinen Bearbeiten-Knopf mehr. Überschrift und Text ändert man durch
 * Hineinschreiben, alles andere durch Anklicken — mit denselben Auswahlen wie
 * beim Anlegen. Ein Dialog, der die Seite verdeckt, während man etwas ändert,
 * die man gerade lesen will, war der Umweg.
 */
export default function Zettel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: todo, isLoading } = useTodo(id ?? null);
  const { data: templates = [] } = useChecklistTemplates();
  const { data: kategorien = [] } = useCategories();
  const { data: pins = [] } = usePinsForRef('todo', id ?? null);
  const { data: reminders = [] } = useTaskReminders(id ?? null);
  const { data: verlauf = [] } = useTodoVerlauf(id ?? null);

  const patch = usePatchTodo();
  const setBuildings = useSetTodoBuildings();
  const applyTemplate = useApplyChecklistTemplate();
  const anWaende = usePinToWalls();
  const pinToWall = usePinToWall();
  const unpin = useUnpin();
  const erledigen = useCompleteNote();
  const loeschen = useSoftDeleteTodo();
  const createReminder = useCreateReminder();
  const deleteReminder = useDeleteReminder();

  const [gebaeude, setGebaeude] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    supabase
      .from('buildings')
      .select('id, name')
      .order('name')
      .then(({ data }) => setGebaeude((data || []) as any[]));
  }, []);

  const [zuruf, setZuruf] = useState('');
  const [neueErinnerung, setNeueErinnerung] = useState('');
  const [erinnerungText, setErinnerungText] = useState('');
  const [erinnerungOffen, setErinnerungOffen] = useState(false);

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
  const erledigtStatus = t.status === 'done';
  // Erledigte Aufgaben behalten ihre Anheftungen in der Spalte "done" —
  // das ist Geschichte, keine Wand, an der sie noch haengt.
  const aktivePins = pins.filter(p => p.columnKey !== 'done');
  const meinPin = aktivePins.find(p => p.userId === user?.id);
  const templateName = templates.find(x => x.id === t.checklist_template_id)?.name ?? null;

  const gebaeudeIds: string[] =
    t.buildings?.map((b: any) => b.building?.id).filter(Boolean) ??
    (t.building_id ? [t.building_id] : []);

  const feld = (p: Record<string, unknown>) => patch.mutate({ id: t.id, patch: p });

  const zurufSenden = async () => {
    const text = zuruf.trim();
    if (!text || !user) return;
    setZuruf('');
    const { error } = await supabase
      .from('todo_comments')
      .insert({ todo_id: t.id, content: text, created_by: user.id });
    if (error) {
      // Der Text ist sonst weg — also zurueck ins Feld, statt ihn zu schlucken.
      setZuruf(text);
      return;
    }
    qc.invalidateQueries({ queryKey: ['todo-verlauf', t.id] });
  };

  return (
    <div className="space-y-4">
      {/* Kopfleiste */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/pinnwand"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Pinnwand
        </Link>
        <span className="text-[12px] text-muted-foreground">#{t.task_number}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Weitere Aktionen">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {meinPin ? (
                <DropdownMenuItem onClick={() => unpin.mutate(meinPin.pinId)}>
                  Von meiner Wand nehmen
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => pinToWall.mutate({ refType: 'todo', refId: t.id })}
                >
                  Auf meine Wand
                </DropdownMenuItem>
              )}
              {erledigtStatus && (
                <DropdownMenuItem onClick={() => feld({ status: 'open', completed_at: null })}>
                  Wieder öffnen
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() =>
                  loeschen.mutate(t.id, { onSuccess: () => navigate('/pinnwand') })
                }
              >
                <Trash2 className="mr-2 h-4 w-4" /> In den Papierkorb
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            className="bg-[#6B8A55] text-white hover:bg-[#5c7849]"
            disabled={erledigtStatus || erledigen.isPending}
            onClick={() =>
              erledigen.mutate(t.id, { onSuccess: () => navigate('/pinnwand') })
            }
          >
            <Check className="mr-1.5 h-4 w-4" />
            {erledigtStatus ? 'Ist erledigt' : 'Erledigt'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Links: das Blatt und die Arbeit */}
        <div className="min-w-0 flex-1 space-y-4">
          <AufgabeBlatt
            titel={t.title}
            beschreibung={t.description}
            gebaeudeIds={gebaeudeIds}
            gebaeude={gebaeude}
            waende={aktivePins.map(p => ({ userId: p.userId, name: p.name, initials: p.initials }))}
            dueDate={t.due_date}
            caseId={t.case_id ?? null}
            erledigt={erledigtStatus}
            onTitel={wert => feld({ title: wert })}
            onBeschreibung={wert => feld({ description: wert })}
            onGebaeude={ids => setBuildings.mutate({ id: t.id, buildingIds: ids })}
            onDueDate={wert => feld({ due_date: wert })}
            onCase={(cid, bid) => {
              feld({ case_id: cid });
              if (cid && bid && gebaeudeIds.length === 0) {
                setBuildings.mutate({ id: t.id, buildingIds: [bid] });
              }
            }}
            onWand={(userId, anheften) => {
              if (anheften) {
                anWaende.mutate({ todoId: t.id, titel: t.title, userIds: [userId] });
              } else {
                const p = aktivePins.find(x => x.userId === userId);
                if (p) unpin.mutate(p.pinId);
              }
            }}
          />

          <ZettelChecklist todoId={t.id} templateName={templateName} />

          {/* Verlauf und Zuruf in einem Strang */}
          <div className="rounded-[11px] border border-border bg-card p-4 lg:p-5">
            <h2 className="mb-4 text-[15px] font-semibold text-foreground">Verlauf</h2>

            {verlauf.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Noch nichts passiert.</p>
            ) : (
              <div className="space-y-3.5">
                {verlauf.map((e: VerlaufEintrag) => (
                  <div key={e.key} className="flex gap-3">
                    <span
                      className={cn(
                        'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white',
                        e.art === 'erledigt' ? 'bg-[#6B8A55]' : 'bg-[#2B2B2B]'
                      )}
                    >
                      {e.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] leading-snug text-foreground">
                        {e.name && <span className="font-semibold">{e.name}</span>}
                        {e.name && e.art === 'kommentar' ? (
                          <span className="text-muted-foreground"> · {zeitpunkt(e.zeitpunkt)}</span>
                        ) : (
                          e.text && <span> {e.text}</span>
                        )}
                        {!e.name && e.text}
                      </div>
                      {e.art !== 'kommentar' && (
                        <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                          {zeitpunkt(e.zeitpunkt)}
                        </div>
                      )}
                      {e.body && (
                        <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-[13px] leading-relaxed text-foreground">
                          {e.body}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
              <label htmlFor="zuruf" className="sr-only">
                Etwas dazuschreiben
              </label>
              <Input
                id="zuruf"
                value={zuruf}
                onChange={e => setZuruf(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') zurufSenden();
                }}
                placeholder="Etwas dazuschreiben …"
                className="h-9 text-[13px]"
              />
              <Button variant="outline" size="sm" disabled={!zuruf.trim()} onClick={zurufSenden}>
                Senden
              </Button>
            </div>
          </div>
        </div>

        {/* Rechts: was aufs Blatt nicht gehört */}
        <aside className="w-full space-y-4 lg:w-[300px] lg:shrink-0">
          <div className="rounded-[11px] border border-border bg-card py-1.5">
            <Zeile label="Kategorie">
              <Select
                value={t.category_id ?? 'none'}
                onValueChange={v => feld({ category_id: v === 'none' ? null : v })}
              >
                <SelectTrigger className="h-8 w-[150px] border-none bg-transparent text-[12.5px] shadow-none hover:bg-muted">
                  <SelectValue placeholder="keine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">keine</SelectItem>
                  {kategorien.map(k => (
                    <SelectItem key={k.id} value={k.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: k.color }}
                        />
                        {k.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Zeile>

            <Zeile label="Priorität">
              <Select value={t.priority} onValueChange={v => feld({ priority: v })}>
                <SelectTrigger className="h-8 w-[150px] border-none bg-transparent text-[12.5px] shadow-none hover:bg-muted">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                    <SelectItem key={p} value={p}>
                      {PRIO_TEXT[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Zeile>

            <Zeile label="Wiedervorlage">
              <Popover>
                <PopoverTrigger asChild>
                  <Wert gesetzt={!!t.follow_up_at}>
                    {t.follow_up_at ? formatDateDe(t.follow_up_at) : 'keine'}
                  </Wert>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={t.follow_up_at ? new Date(t.follow_up_at) : undefined}
                    onSelect={d => feld({ follow_up_at: d ? format(d, 'yyyy-MM-dd') : null })}
                    initialFocus
                    locale={de}
                  />
                  <p className="border-t border-border p-2 text-[11.5px] leading-snug text-muted-foreground">
                    Die Aufgabe verschwindet bis dahin und kommt dann von selbst zurück.
                  </p>
                </PopoverContent>
              </Popover>
            </Zeile>

            <Zeile label="Im Vorrat ab">
              <Popover>
                <PopoverTrigger asChild>
                  <Wert gesetzt={!!t.show_in_list_date}>
                    {t.show_in_list_date ? formatDateDe(t.show_in_list_date) : 'sofort'}
                  </Wert>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={t.show_in_list_date ? new Date(t.show_in_list_date) : undefined}
                    onSelect={d => feld({ show_in_list_date: d ? format(d, 'yyyy-MM-dd') : null })}
                    initialFocus
                    locale={de}
                  />
                </PopoverContent>
              </Popover>
            </Zeile>

            <Zeile label="Wiederholt sich">
              <Wert
                gesetzt={!!t.is_recurring}
                onClick={() => feld({ is_recurring: !t.is_recurring })}
              >
                {t.is_recurring
                  ? `alle ${t.recurrence_interval ?? 1} ${WDH_TEXT[t.recurrence_pattern ?? 'weekly']}`
                  : 'nein'}
              </Wert>
            </Zeile>

            <Zeile label="Anleitung">
              {templateName ? (
                <span className="px-2 py-1 text-[12.5px] text-foreground">{templateName}</span>
              ) : (
                <Select
                  value=""
                  onValueChange={v =>
                    applyTemplate.mutate({ todoId: t.id, templateId: v, userId: user!.id })
                  }
                >
                  <SelectTrigger className="h-8 w-[150px] border-none bg-transparent text-[12.5px] shadow-none hover:bg-muted">
                    <SelectValue placeholder="keine" />
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
            </Zeile>
          </div>

          <div className="rounded-[11px] border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Erinnerung
            </h3>

            {reminders.length === 0 && !erinnerungOffen && (
              <p className="mb-2 text-[12.5px] leading-relaxed text-muted-foreground">
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
                    <div className="text-[13px] text-foreground">{r.note || 'Erinnerung'}</div>
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
                  aria-label="Datum der Erinnerung"
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

          <div className="rounded-[11px] border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Anhänge
            </h3>
            <TodoAttachments todo={todo} />
          </div>

          <p className="px-1 text-[11.5px] leading-relaxed text-muted-foreground">
            Geschrieben am {formatDateDe(t.created_at)}
            {t.completed_at && ` · erledigt am ${formatDateDe(t.completed_at)}`}
          </p>
        </aside>
      </div>
    </div>
  );
}
