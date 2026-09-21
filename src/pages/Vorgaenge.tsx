import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BUCKET_DOT,
  BUCKET_LABEL,
  BUCKET_ORDER,
  CaseOverview,
  SilenceBucket,
  useActivityWeeks,
  useCaseReview,
  useCaseReviewStats,
  useResolveCase,
  useSnoozeCase,
} from '@/hooks/useCaseReview';
import { ActivitySparkline } from '@/components/cases/ActivitySparkline';
import { CaseDirectionIcon, beschreibeHerkunft } from '@/components/cases/CaseDirectionIcon';
import { SnoozePopover } from '@/components/cases/SnoozePopover';
import { usePinToWall } from '@/hooks/useBoardPins';
import { formatDateDe } from '@/hooks/useBoardPins';

/** Wie viele Zeilen je Gruppe zunächst sichtbar sind. */
const ERSTE_ZEILEN = 4;

type Filter = 'alle' | 'eingang' | 'ohne_wand';

/**
 * Die Durchsicht (Screen 4 des Entwurfs).
 *
 * Sortiert nicht nach Datum, sondern danach, wie lange nichts passiert ist.
 * Und gruppiert statt zu sortieren — dadurch muss niemand einen Schwellenwert
 * festlegen, ab dem ein Vorgang „alt" ist.
 */
export default function Vorgaenge() {
  const navigate = useNavigate();
  const { data: faelle = [], isLoading } = useCaseReview();
  const { data: stats } = useCaseReviewStats();
  const snooze = useSnoozeCase();
  const resolve = useResolveCase();
  const pinToWall = usePinToWall();

  const [filter, setFilter] = useState<Filter>('alle');
  const [offeneGruppen, setOffeneGruppen] = useState<Record<string, boolean>>({
    ueber_3_monate: true,
    zwei_bis_drei_monate: true,
  });
  const [alleZeilen, setAlleZeilen] = useState<Record<string, boolean>>({});

  const gefiltert = useMemo(() => {
    if (filter === 'eingang') return faelle.filter(c => c.last_kind === 'in');
    if (filter === 'ohne_wand') return faelle.filter(c => !c.on_a_wall);
    return faelle;
  }, [faelle, filter]);

  const gruppen = useMemo(() => {
    const map = new Map<SilenceBucket, CaseOverview[]>();
    BUCKET_ORDER.forEach(b => map.set(b, []));
    gefiltert.forEach(c => map.get(c.silence_bucket)?.push(c));
    return map;
  }, [gefiltert]);

  /** Streifen nur für das, was gerade aufgeklappt ist. */
  const sichtbareIds = useMemo(() => {
    const ids: string[] = [];
    BUCKET_ORDER.forEach(b => {
      if (!offeneGruppen[b]) return;
      const liste = gruppen.get(b) || [];
      const anzahl = alleZeilen[b] ? liste.length : ERSTE_ZEILEN;
      liste.slice(0, anzahl).forEach(c => ids.push(c.id));
    });
    return ids;
  }, [gruppen, offeneGruppen, alleZeilen]);

  const { data: streifen } = useActivityWeeks(sichtbareIds);

  const kachel = (zahl: number | undefined, text: string, betont = false) => (
    <div
      className={`rounded-[11px] border p-4 ${
        betont ? 'border-[#F3CBA0] bg-[#FFF7ED]' : 'border-border bg-card'
      }`}
    >
      <div className={`text-[26px] font-semibold leading-none ${betont ? 'text-[#b4692b]' : 'text-foreground'}`}>
        {zahl ?? '–'}
      </div>
      <div className={`mt-1.5 text-[12.5px] ${betont ? 'font-medium text-[#8a5417]' : 'text-muted-foreground'}`}>
        {text}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[17px] font-semibold text-foreground">Vorgänge</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Sortiert nach Stille · letzte Bewegung aus Mail, Notiz oder Telefon
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kachel(stats?.offen, 'offene Vorgänge')}
        {kachel(stats?.laengerAlsMonat, 'länger als einen Monat still')}
        {kachel(stats?.aufKeinerWand, 'davon auf keiner Wand', true)}
        {kachel(stats?.ruhend, 'ruhen bis später')}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([
          ['alle', 'Alle'],
          ['eingang', 'Zuletzt kam etwas rein'],
          ['ohne_wand', 'Auf keiner Wand'],
        ] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] transition-colors ${
              filter === key
                ? 'bg-[#2B2B2B] text-white'
                : 'border border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-[58px]" />
          <Skeleton className="h-[58px]" />
          <Skeleton className="h-[58px]" />
        </div>
      )}

      {!isLoading &&
        BUCKET_ORDER.map(bucket => {
          const liste = gruppen.get(bucket) || [];
          if (liste.length === 0) return null;

          const offen = !!offeneGruppen[bucket];
          const zeigeAlle = !!alleZeilen[bucket];
          const sichtbar = zeigeAlle ? liste : liste.slice(0, ERSTE_ZEILEN);
          const ohneWand = liste.filter(c => !c.on_a_wall).length;
          const ruhig = bucket === 'in_bewegung';

          return (
            <section key={bucket} className="space-y-2">
              <button
                type="button"
                onClick={() => setOffeneGruppen(g => ({ ...g, [bucket]: !offen }))}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  ruhig ? 'bg-muted/60' : 'hover:bg-muted/40'
                }`}
              >
                <span className={`h-[9px] w-[9px] rounded-full ${BUCKET_DOT[bucket]}`} />
                <span className="text-[13.5px] font-semibold text-foreground">
                  {BUCKET_LABEL[bucket]}
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  {liste.length} {liste.length === 1 ? 'Vorgang' : 'Vorgänge'}
                  {!ruhig && ohneWand > 0 && ` · ${ohneWand} auf keiner Wand`}
                  {ruhig && ' · brauchen nichts'}
                </span>
                <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-muted-foreground">
                  {offen ? (
                    <>zuklappen <ChevronUp className="h-3.5 w-3.5" /></>
                  ) : (
                    <>aufklappen <ChevronDown className="h-3.5 w-3.5" /></>
                  )}
                </span>
              </button>

              {offen && (
                <div className="space-y-2">
                  {sichtbar.map(c => (
                    <article
                      key={c.id}
                      className="flex flex-col gap-3 rounded-[11px] border border-border bg-card p-3.5 lg:flex-row lg:items-center"
                    >
                      <div className="min-w-0 lg:w-[320px] lg:shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate(`/vorgaenge/${c.id}`)}
                          className="block text-left text-[13.5px] font-semibold leading-snug text-foreground hover:underline"
                        >
                          {c.title}
                        </button>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                          {c.building_name && <span>{c.building_name}</span>}
                          {c.unit_number && <span>· Whg. {c.unit_number}</span>}
                          {c.category && (
                            <span className="rounded bg-muted px-1.5 py-0.5">{c.category}</span>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 lg:w-[250px] lg:shrink-0">
                        <div className="flex items-start gap-1.5">
                          <span className="mt-[2px] shrink-0">
                            <CaseDirectionIcon kind={c.last_kind} />
                          </span>
                          <span className="min-w-0 text-[12.5px] text-foreground">
                            <span className="block truncate">
                              {beschreibeHerkunft(c.last_kind, c.last_who)}
                            </span>
                            <span className="block text-[11.5px] text-muted-foreground">
                              {formatDateDe(c.last_movement_at)} · vor {c.silent_days} Tagen
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="hidden lg:block lg:w-[110px] lg:shrink-0">
                        <ActivitySparkline weeks={streifen?.get(c.id) ?? new Array(12).fill(0)} />
                      </div>

                      <div className="lg:w-[138px] lg:shrink-0">
                        {c.on_a_wall ? (
                          <span className="text-[12.5px] text-muted-foreground">hängt an einer Wand</span>
                        ) : (
                          <span className="text-[12.5px] font-semibold text-[#9C3D24]">
                            auf keiner Wand
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:ml-auto">
                        <SnoozePopover
                          snoozeUntil={c.snooze_until}
                          onSnooze={bis => snooze.mutate({ caseId: c.id, bis })}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 whitespace-nowrap border-primary text-[12.5px] text-primary hover:bg-primary hover:text-primary-foreground"
                          onClick={() => pinToWall.mutate({ refType: 'case', refId: c.id })}
                        >
                          Auf die Wand
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 bg-[#6B8A55] text-[12.5px] text-white hover:bg-[#5c7849]"
                          onClick={() => resolve.mutate(c.id)}
                        >
                          Erledigt
                        </Button>
                      </div>
                    </article>
                  ))}

                  {liste.length > ERSTE_ZEILEN && (
                    <button
                      type="button"
                      onClick={() => setAlleZeilen(a => ({ ...a, [bucket]: !zeigeAlle }))}
                      className="text-[12.5px] text-primary hover:underline"
                    >
                      {zeigeAlle
                        ? 'weniger anzeigen'
                        : `${liste.length - ERSTE_ZEILEN} weitere in dieser Gruppe anzeigen`}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}

      {!isLoading && gefiltert.length === 0 && (
        <p className="py-12 text-center text-[13px] text-muted-foreground">
          Kein Vorgang passt zu diesem Filter.
        </p>
      )}
    </div>
  );
}
