import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Check, ChevronLeft, Circle, Clock, Paperclip, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  useCaseEvents,
  useAddCaseEvent,
  useSummarizeCase,
  CASE_CATEGORY_LABEL,
  CaseCategory,
} from '@/hooks/useCases';
import {
  useCaseOverviewOne,
  useCaseActivityWeeks,
  useSnoozeCase,
  useResolveCase,
} from '@/hooks/useCaseReview';
import { ActivitySparkline, beschreibeVerlauf } from '@/components/cases/ActivitySparkline';
import { CaseDirectionIcon } from '@/components/cases/CaseDirectionIcon';
import { SnoozePopover } from '@/components/cases/SnoozePopover';
import { usePinsForRef } from '@/hooks/useBoardWalls';
import { usePinToWall, useUnpin, formatDateDe } from '@/hooks/useBoardPins';
import { useCaseEmails, mailText } from '@/hooks/useCaseEmails';
import { EmailEintrag } from '@/components/cases/EmailEintrag';
import { useCaseTodos } from '@/hooks/useCaseTodos';
import { TodoDialog } from '@/components/todos/TodoDialog';

/** Umlaute und Gross-/Kleinschreibung beim Suchen ignorieren. */
function normal(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function zeitpunkt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  );
}

/** Der Ereignistyp der Akte auf dasselbe Icon abbilden wie in der Durchsicht. */
function iconArt(eventType: string): string {
  if (eventType === 'email') return 'in';
  return eventType;
}

/**
 * Die Vorgangs-Akte (Screen 5 des Entwurfs).
 *
 * Kein Status-Dropdown, kein Verantwortlichen-Feld. Oben steht, wie lange
 * nichts passiert ist; darunter der Verlauf, damit man in zehn Sekunden
 * weiß, woran es hängt.
 */
export default function Vorgang() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: vorgang, isLoading } = useCaseOverviewOne(id ?? null);
  const { data: events = [] } = useCaseEvents(id ?? null);
  const { data: wochen = [] } = useCaseActivityWeeks(id ?? null);
  const { data: pins = [] } = usePinsForRef('case', id ?? null);
  const { data: mails } = useCaseEmails(id ?? null);
  const { data: aufgaben = [] } = useCaseTodos(id ?? null);

  const snooze = useSnoozeCase();
  const resolve = useResolveCase();
  const addEvent = useAddCaseEvent();
  const summarize = useSummarizeCase();
  const pinToWall = usePinToWall();
  const unpin = useUnpin();

  const [notiz, setNotiz] = useState('');
  // Notiz oder Telefonat — dieselbe Eingabe, nur eine andere Art Eintrag.
  const [art, setArt] = useState<'note' | 'phone'>('note');
  const [mitWem, setMitWem] = useState('');
  const [suche, setSuche] = useState('');
  const [neueAufgabe, setNeueAufgabe] = useState(false);

  /**
   * Der Verlauf, vollständig.
   *
   * Nicht jede Mail, die an diesem Vorgang hängt, hat auch einen Eintrag im
   * Verlauf bekommen — von den zugeordneten Mails fehlt rund die Hälfte.
   * Deshalb werden die fehlenden hier ergänzt, statt sie unsichtbar zu
   * lassen. So ist der Verlauf die eine Stelle, an der alles steht.
   */
  const verlauf = useMemo(() => {
    const ausEreignissen = events.map(e => ({
      key: e.id,
      eventType: e.event_type as string,
      occurredAt: e.occurred_at,
      title: e.title || e.event_type,
      body: e.body,
      attachments: Array.isArray(e.attachments) ? e.attachments : [],
      mailId: e.event_type === 'email' ? e.source_id : null,
    }));

    const schonImVerlauf = new Set(
      events.map(e => e.source_id).filter(Boolean) as string[]
    );

    const nurZugeordnet = Array.from(mails?.values() ?? [])
      .filter(m => !schonImVerlauf.has(m.id))
      .map(m => ({
        key: `mail:${m.id}`,
        eventType: 'email',
        occurredAt: m.date ?? new Date(0).toISOString(),
        title: m.subject || '(kein Betreff)',
        body: null as string | null,
        attachments: [] as any[],
        mailId: m.id,
      }));

    return [...ausEreignissen, ...nurZugeordnet].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
  }, [events, mails]);

  /**
   * Die Suche im Vorgang.
   *
   * Sie greift auch in den Wortlaut der Mails, nicht nur in Titel und Notiz —
   * sonst fände man genau das nicht wieder, wofür man sucht.
   */
  const gefiltert = useMemo(() => {
    const woerter = normal(suche.trim()).split(/\s+/).filter(Boolean);
    if (!woerter.length) return verlauf;

    return verlauf.filter(e => {
      const mail = e.mailId ? mails?.get(e.mailId) : undefined;
      const heuhaufen = normal(
        [e.title, e.body, mail ? mailText(mail) : null, mail?.from_name, mail?.from_address]
          .filter(Boolean)
          .join(' ')
      );
      return woerter.every(w => heuhaufen.includes(w));
    });
  }, [verlauf, suche, mails]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!vorgang) {
    return (
      <div className="py-16 text-center">
        <p className="text-[15px] font-medium text-foreground">Diesen Vorgang gibt es nicht.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/vorgaenge')}>
          Zurück zur Durchsicht
        </Button>
      </div>
    );
  }

  const meinPin = pins.find(p => p.userId === user?.id);
  const still = vorgang.silent_days > 30;

  return (
    <div className="space-y-4">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/vorgaenge"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Durchsicht
        </Link>
        <h1 className="text-[17px] font-semibold text-foreground">{vorgang.title}</h1>

        <div className="ml-auto flex flex-wrap gap-2">
          <SnoozePopover
            variant="leiste"
            snoozeUntil={vorgang.snooze_until}
            onSnooze={bis => snooze.mutate({ caseId: vorgang.id, bis })}
          />
          {meinPin ? (
            <Button variant="outline" size="sm" onClick={() => unpin.mutate(meinPin.pinId)}>
              Von meiner Wand nehmen
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => pinToWall.mutate({ refType: 'case', refId: vorgang.id })}
            >
              Auf meine Wand
            </Button>
          )}
          <Button
            size="sm"
            className="bg-[#6B8A55] text-white hover:bg-[#5c7849]"
            onClick={() => resolve.mutate(vorgang.id)}
          >
            Erledigt
          </Button>
        </div>
      </div>

      {/* Metazeile */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
        {vorgang.building_name && <span>{vorgang.building_name}</span>}
        {vorgang.category && (
          <span className="rounded bg-muted px-2 py-0.5">
            {CASE_CATEGORY_LABEL[vorgang.category as CaseCategory] ?? vorgang.category}
          </span>
        )}
        {vorgang.unit_number && <span>· Whg. {vorgang.unit_number}</span>}
        <span>· angelegt {formatDateDe(vorgang.created_at)}</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Links: Verlauf */}
        <div className="min-w-0 flex-1 space-y-4">
          {still && (
            <div className="flex gap-2.5 rounded-[11px] border border-[#F3CBA0] bg-[#FFF7ED] p-3.5">
              <Clock className="mt-[2px] h-4 w-4 shrink-0 text-[#b4692b]" />
              <div>
                <p className="text-[13.5px] font-semibold text-[#8a5417]">
                  Seit {vorgang.silent_days} Tagen keine Bewegung
                  {!vorgang.on_a_wall && ' — und auf keiner Wand'}
                </p>
                {vorgang.last_subject && (
                  <p className="mt-0.5 text-[12.5px] text-[#8a5417]">
                    Zuletzt: {vorgang.last_subject}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="rounded-[11px] border border-border bg-card p-4 lg:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-[15px] font-semibold text-foreground">Verlauf</h2>
              <div className="relative ml-auto w-full sm:w-[260px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={suche}
                  onChange={e => setSuche(e.target.value)}
                  placeholder="Im Vorgang suchen …"
                  className="h-8 pl-8 pr-8 text-[12.5px]"
                  aria-label="Im Verlauf dieses Vorgangs suchen"
                />
                {suche && (
                  <button
                    type="button"
                    onClick={() => setSuche('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Suche leeren"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {suche.trim() && (
              <p className="mb-3 text-[12px] text-muted-foreground">
                {gefiltert.length} von {verlauf.length} Einträgen
              </p>
            )}

            {verlauf.length === 0 && (
              <p className="text-[13px] text-muted-foreground">
                Seit dem Anlegen ist nichts eingetragen worden.
              </p>
            )}

            {verlauf.length > 0 && gefiltert.length === 0 && (
              <p className="text-[13px] text-muted-foreground">
                Nichts gefunden zu „{suche.trim()}".
              </p>
            )}

            <div className="space-y-4">
              {gefiltert.map((e, i) => {
                const mail = e.mailId ? mails?.get(e.mailId) : undefined;
                return (
                  <div key={e.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-background">
                        <CaseDirectionIcon kind={iconArt(e.eventType)} />
                      </span>
                      {i < gefiltert.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                    </div>

                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[13.5px] font-semibold text-foreground">
                          {e.title}
                        </span>
                        <span className="text-[11.5px] text-muted-foreground">
                          {zeitpunkt(e.occurredAt)}
                        </span>
                      </div>

                      {mail ? (
                        <EmailEintrag mail={mail} zusammenfassung={e.body} />
                      ) : e.body ? (
                        <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">
                          {e.body.length > 400 ? e.body.slice(0, 400) + ' …' : e.body}
                        </p>
                      ) : null}

                      {e.attachments.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {e.attachments.map((a: any, k: number) => (
                            <span
                              key={k}
                              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11.5px] text-muted-foreground"
                            >
                              <Paperclip className="h-3 w-3" />
                              {a?.name || 'Anhang'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/*
              Notiz und Telefonat teilen sich dieselbe Eingabe. Ein Anruf ist
              die häufigste Bewegung, die sonst nirgends landet — und ihn
              festzuhalten soll nicht mehr Aufwand sein als eine Notiz.
            */}
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2 flex gap-1.5">
                {([
                  ['note', 'Notiz'],
                  ['phone', 'Telefonat'],
                ] as ['note' | 'phone', string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setArt(key)}
                    className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${
                      art === key
                        ? 'bg-[#2B2B2B] text-white'
                        : 'border border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {art === 'phone' && (
                <Input
                  value={mitWem}
                  onChange={e => setMitWem(e.target.value)}
                  placeholder="Mit wem? Name, Firma oder Nummer"
                  className="mb-2 h-9 text-[13px]"
                  aria-label="Gesprächspartner"
                />
              )}

              <Textarea
                placeholder={
                  art === 'phone'
                    ? 'Was besprochen wurde, was vereinbart ist …'
                    : 'Notiz hinzufügen …'
                }
                value={notiz}
                onChange={e => setNotiz(e.target.value)}
                rows={2}
                className="text-[13px]"
              />

              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11.5px] text-muted-foreground">
                  {art === 'phone'
                    ? 'Zählt als Bewegung — der Vorgang gilt danach nicht mehr als still.'
                    : ''}
                </span>
                <Button
                  size="sm"
                  disabled={
                    addEvent.isPending ||
                    (art === 'phone' ? !mitWem.trim() && !notiz.trim() : !notiz.trim())
                  }
                  onClick={() => {
                    addEvent.mutate({
                      case_id: vorgang.id,
                      event_type: art,
                      title:
                        art === 'phone'
                          ? mitWem.trim()
                            ? `Telefonat mit ${mitWem.trim()}`
                            : 'Telefonat'
                          : 'Notiz',
                      body: notiz.trim() || undefined,
                    });
                    setNotiz('');
                    setMitWem('');
                  }}
                >
                  {art === 'phone' ? 'Telefonat eintragen' : 'Notiz speichern'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Rechts */}
        <aside className="w-full space-y-4 lg:w-[340px] lg:shrink-0">
          {/*
            Die Kurzfassung. Ein paar Sätze zur Sache und ein paar zum letzten
            Schritt — damit man nicht erst den ganzen Verlauf lesen muss, um zu
            wissen, woran man ist. Sie wird auf Knopfdruck neu gebildet.
          */}
          <div className="rounded-[11px] border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Kurzfassung
              </h3>
              <button
                type="button"
                onClick={() => summarize.mutate(vorgang.id)}
                disabled={summarize.isPending}
                className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                title="Kurzfassung neu bilden"
              >
                <RefreshCw className={`h-3 w-3 ${summarize.isPending ? 'animate-spin' : ''}`} />
                {summarize.isPending ? 'liest …' : 'neu lesen'}
              </button>
            </div>

            {vorgang.ai_summary || vorgang.ai_last_step ? (
              <div className="space-y-3">
                {vorgang.ai_summary && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Worum es geht
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-foreground">
                      {vorgang.ai_summary}
                    </p>
                  </div>
                )}
                {vorgang.ai_last_step && (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Zuletzt passiert
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-foreground">
                      {vorgang.ai_last_step}
                    </p>
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Von der KI gelesen
                  {vorgang.ai_summary_updated_at &&
                    `, Stand ${formatDateDe(vorgang.ai_summary_updated_at)}`}
                  . Im Zweifel gilt der Verlauf darunter.
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Noch keine Kurzfassung. Über „neu lesen" geht die KI den Verlauf durch und fasst
                ihn zusammen.
              </p>
            )}
          </div>

          {/*
            Die Aufgaben zu diesem Vorgang. Der Verlauf zeigt, was erledigt
            wurde; hier steht auch, was noch aussteht — sonst sieht ein
            Vorgang still aus, obwohl jemand längst daran sitzt.
          */}
          <div className="rounded-[11px] border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Aufgaben
              </h3>
              <button
                type="button"
                onClick={() => setNeueAufgabe(true)}
                className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> neue Aufgabe
              </button>
            </div>

            {aufgaben.length === 0 ? (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Keine Aufgabe zu diesem Vorgang. Was hier angelegt wird, steht beim Erledigen
                von selbst im Verlauf.
              </p>
            ) : (
              <div className="space-y-2">
                {aufgaben.map(a => {
                  const erledigt = a.status === 'done';
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => navigate(`/pinnwand/${a.id}`)}
                      className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted"
                    >
                      <span className="mt-[3px] shrink-0">
                        {erledigt ? (
                          <Check className="h-3.5 w-3.5 text-[#6B8A55]" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[13px] leading-snug ${
                            erledigt ? 'text-muted-foreground line-through' : 'text-foreground'
                          }`}
                        >
                          {a.title}
                        </span>
                        <span className="block text-[11.5px] text-muted-foreground">
                          {erledigt
                            ? a.completed_at
                              ? `erledigt ${formatDateDe(a.completed_at)}`
                              : 'erledigt'
                            : a.waende.length > 0
                              ? `bei ${a.waende.map(w => w.name.split(' ')[0]).join(', ')}`
                              : a.due_date
                                ? `fällig ${formatDateDe(a.due_date)}`
                                : 'an keiner Wand'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-[11px] border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Aktivität, 12 Wochen
            </h3>
            <ActivitySparkline weeks={wochen.length ? wochen : new Array(12).fill(0)} size="gross" />
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {beschreibeVerlauf(wochen)}
            </p>
          </div>

          <div className="rounded-[11px] border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Hängt an diesen Wänden
            </h3>
            {pins.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                An keiner Wand. Der Vorgang liegt bei niemandem — deshalb taucht er in der
                Durchsicht auf.
              </p>
            ) : (
              <div className="space-y-2">
                {pins.map(p => (
                  <div key={p.pinId} className="flex items-center gap-2">
                    <span className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#2B2B2B] text-[10px] font-semibold text-white">
                      {p.initials}
                    </span>
                    <span className="text-[13px] text-foreground">{p.name}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              Kein Zuständiger vergeben — der Vorgang liegt bei dem, auf dessen Wand er hängt.
            </p>
          </div>

          <div className="rounded-[11px] border border-border bg-card p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Verknüpft
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded border border-border px-2 py-1 text-[12px] text-muted-foreground">
                {verlauf.length} {verlauf.length === 1 ? 'Eintrag' : 'Einträge'} im Verlauf
              </span>
              <span className="rounded border border-border px-2 py-1 text-[12px] text-muted-foreground">
                {verlauf.filter(e => e.eventType === 'email').length} E-Mails
              </span>
              <span className="rounded border border-border px-2 py-1 text-[12px] text-muted-foreground">
                {verlauf.filter(e => e.eventType === 'phone').length} Telefonate
              </span>
            </div>
          </div>
        </aside>
      </div>

      <TodoDialog
        open={neueAufgabe}
        onOpenChange={setNeueAufgabe}
        mode="create"
        vorbelegung={{ caseId: vorgang.id, buildingId: vorgang.building_id }}
      />
    </div>
  );
}
