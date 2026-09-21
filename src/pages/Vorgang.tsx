import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Clock, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  useCaseEvents,
  useAddCaseEvent,
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

  const snooze = useSnoozeCase();
  const resolve = useResolveCase();
  const addEvent = useAddCaseEvent();
  const pinToWall = usePinToWall();
  const unpin = useUnpin();

  const [notiz, setNotiz] = useState('');

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
            <h2 className="mb-4 text-[15px] font-semibold text-foreground">Verlauf</h2>

            {events.length === 0 && (
              <p className="text-[13px] text-muted-foreground">
                Seit dem Anlegen ist nichts eingetragen worden.
              </p>
            )}

            <div className="space-y-4">
              {events.map((e, i) => (
                <div key={e.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-background">
                      <CaseDirectionIcon kind={iconArt(e.event_type)} />
                    </span>
                    {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                  </div>

                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13.5px] font-semibold text-foreground">
                        {e.title || e.event_type}
                      </span>
                      <span className="text-[11.5px] text-muted-foreground">
                        {zeitpunkt(e.occurred_at)}
                      </span>
                    </div>
                    {e.body && (
                      <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">
                        {e.body.length > 400 ? e.body.slice(0, 400) + ' …' : e.body}
                      </p>
                    )}
                    {Array.isArray(e.attachments) && e.attachments.length > 0 && (
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
              ))}
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <Textarea
                placeholder="Notiz hinzufügen …"
                value={notiz}
                onChange={e => setNotiz(e.target.value)}
                rows={2}
                className="text-[13px]"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  disabled={!notiz.trim() || addEvent.isPending}
                  onClick={() => {
                    addEvent.mutate({
                      case_id: vorgang.id,
                      event_type: 'note',
                      title: 'Notiz',
                      body: notiz.trim(),
                    });
                    setNotiz('');
                  }}
                >
                  Notiz speichern
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Rechts */}
        <aside className="w-full space-y-4 lg:w-[340px] lg:shrink-0">
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
                {events.length} {events.length === 1 ? 'Eintrag' : 'Einträge'} im Verlauf
              </span>
              <span className="rounded border border-border px-2 py-1 text-[12px] text-muted-foreground">
                {events.filter(e => e.event_type === 'email').length} E-Mails
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
