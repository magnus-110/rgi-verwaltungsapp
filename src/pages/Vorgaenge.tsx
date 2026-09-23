import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BUCKET_DOT,
  BUCKET_LABEL,
  BUCKET_ORDER,
  CaseOverview,
  OFFENE_STATUS,
  STATUS_LABEL,
  SilenceBucket,
  istInDurchsicht,
  useActivityWeeks,
  useCaseReview,
  useCaseReviewStats,
  useResolveCase,
  useSnoozeCase,
} from '@/hooks/useCaseReview';
import { CASE_CATEGORY_LABEL, CaseCategory } from '@/hooks/useCases';
import { ActivitySparkline } from '@/components/cases/ActivitySparkline';
import { CaseDirectionIcon, beschreibeHerkunft } from '@/components/cases/CaseDirectionIcon';
import { SnoozePopover } from '@/components/cases/SnoozePopover';
import { usePinToWall } from '@/hooks/useBoardPins';
import { formatDateDe } from '@/hooks/useBoardPins';
import { TodoDialog } from '@/components/todos/TodoDialog';

/** Wie viele Zeilen je Gruppe zunächst sichtbar sind. */
const ERSTE_ZEILEN = 4;

type Lage = 'alle' | 'eingang' | 'ohne_wand';
type StatusWahl = 'durchsicht' | 'offen' | 'ruhend' | 'erledigt' | 'alle';

const STATUS_WAHL: [StatusWahl, string][] = [
  ['durchsicht', 'In der Durchsicht'],
  ['offen', 'Alle offenen'],
  ['ruhend', 'Ruhend'],
  ['erledigt', 'Erledigt'],
  ['alle', 'Alle'],
];

/** Umlaute und Groß-/Kleinschreibung beim Suchen ignorieren. */
function normal(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Die Durchsicht (Screen 4 des Entwurfs).
 *
 * Sortiert nicht nach Datum, sondern danach, wie lange nichts passiert ist.
 * Und gruppiert statt zu sortieren — dadurch muss niemand einen Schwellenwert
 * festlegen, ab dem ein Vorgang „alt" ist.
 *
 * Darüber liegt die Suche: gut hundert Vorgänge sind einmal geladen, also
 * findet man auch einen längst erledigten sofort wieder.
 */
export default function Vorgaenge() {
  const navigate = useNavigate();
  const { data: faelle = [], isLoading } = useCaseReview();
  const { data: stats } = useCaseReviewStats();
  const snooze = useSnoozeCase();
  const resolve = useResolveCase();
  const pinToWall = usePinToWall();

  const [suche, setSuche] = useState('');
  const [lage, setLage] = useState<Lage>('alle');
  const [statusWahl, setStatusWahl] = useState<StatusWahl>('durchsicht');
  const [gebaeude, setGebaeude] = useState('');
  const [kategorie, setKategorie] = useState('');
  const [neueAufgabe, setNeueAufgabe] = useState(false);

  const [offeneGruppen, setOffeneGruppen] = useState<Record<string, boolean>>({
    ueber_3_monate: true,
    zwei_bis_drei_monate: true,
  });
  const [alleZeilen, setAlleZeilen] = useState<Record<string, boolean>>({});

  const heute = new Date().toISOString().slice(0, 10);

  /**
   * Die Gebaeude — mit der Zahl der Vorgaenge, die beim aktuellen Status
   * uebrig bleiben. Erst das Haus waehlen, dann hinsehen: so arbeitet man
   * eine Liegenschaft ab, statt zwischen dreiundzwanzig zu springen.
   */
  const gebaeudeListe = useMemo(() => {
    const zaehler = new Map<string, number>();
    faelle.forEach(c => {
      if (!c.building_name) return;
      if (statusWahl === 'durchsicht' && !istInDurchsicht(c, heute)) return;
      if (statusWahl === 'offen' && !OFFENE_STATUS.includes(c.status)) return;
      if (statusWahl === 'ruhend' && !(c.snooze_until && c.snooze_until > heute)) return;
      if (statusWahl === 'erledigt' && !['resolved', 'archived'].includes(c.status)) return;
      zaehler.set(c.building_name, (zaehler.get(c.building_name) ?? 0) + 1);
    });
    return Array.from(zaehler.entries())
      .map(([name, anzahl]) => ({ name, anzahl }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [faelle, statusWahl, heute]);

  const gesamtImStatus = useMemo(
    () => gebaeudeListe.reduce((n, g) => n + g.anzahl, 0),
    [gebaeudeListe]
  );

  /** Zum gewaehlten Gebaeudenamen die Kennung — die braucht eine neue Aufgabe. */
  const gebaeudeId = useMemo(
    () => (gebaeude ? faelle.find(c => c.building_name === gebaeude)?.building_id ?? null : null),
    [faelle, gebaeude]
  );

  const kategorieListe = useMemo(() => {
    const keys = new Set<string>();
    faelle.forEach(c => c.category && keys.add(c.category));
    return Array.from(keys).sort();
  }, [faelle]);

  const gefiltert = useMemo(() => {
    const suchbegriffe = normal(suche.trim())
      .split(/\s+/)
      .filter(Boolean);

    return faelle.filter(c => {
      // Status
      if (statusWahl === 'durchsicht' && !istInDurchsicht(c, heute)) return false;
      if (statusWahl === 'offen' && !OFFENE_STATUS.includes(c.status)) return false;
      if (statusWahl === 'ruhend' && !(c.snooze_until && c.snooze_until > heute)) return false;
      if (statusWahl === 'erledigt' && !['resolved', 'archived'].includes(c.status)) return false;

      if (gebaeude && c.building_name !== gebaeude) return false;
      if (kategorie && c.category !== kategorie) return false;

      if (lage === 'eingang' && c.last_kind !== 'in') return false;
      if (lage === 'ohne_wand' && c.on_a_wall) return false;

      if (suchbegriffe.length) {
        const heuhaufen = normal(
          [
            c.title,
            c.building_name,
            c.unit_number,
            c.last_subject,
            c.last_who,
            c.category ? CASE_CATEGORY_LABEL[c.category as CaseCategory] ?? c.category : null,
          ]
            .filter(Boolean)
            .join(' ')
        );
        // Alle Wörter müssen vorkommen, in beliebiger Reihenfolge.
        if (!suchbegriffe.every(w => heuhaufen.includes(w))) return false;
      }

      return true;
    });
  }, [faelle, suche, lage, statusWahl, gebaeude, kategorie, heute]);

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

  const filterAktiv =
    !!suche.trim() || lage !== 'alle' || statusWahl !== 'durchsicht' || !!gebaeude || !!kategorie;

  const zuruecksetzen = () => {
    setSuche('');
    setLage('alle');
    setStatusWahl('durchsicht');
    setGebaeude('');
    setKategorie('');
  };

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

  const auswahlKlasse =
    'h-9 rounded-md border border-border bg-background px-2.5 text-[12.5px] text-foreground';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[17px] font-semibold text-foreground">Vorgänge</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Sortiert nach Stille · letzte Bewegung aus Mail, Notiz oder Telefon
          </p>
        </div>
        {/*
          Aufgabe zum gewaehlten Haus: das Gebaeude oben ist ohnehin schon
          gewaehlt, also wird es gleich uebernommen.
        */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          onClick={() => setNeueAufgabe(true)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {gebaeude ? `Aufgabe für ${gebaeude}` : 'Aufgabe schreiben'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kachel(stats?.offen, 'offene Vorgänge')}
        {kachel(stats?.laengerAlsMonat, 'länger als einen Monat still')}
        {kachel(stats?.aufKeinerWand, 'davon auf keiner Wand', true)}
        {kachel(stats?.ruhend, 'ruhen bis später')}
      </div>

      {/* Suche und Filter */}
      <div className="space-y-2.5 rounded-[11px] border border-border bg-card p-3.5">
        {/*
          Das Gebaeude steht ganz oben und nicht in einer Auswahlliste: man
          arbeitet eine Liegenschaft ab, nicht einen Querschnitt.
        */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setGebaeude('')}
            className={`h-8 rounded-full border px-3 text-[12px] font-medium transition-colors ${
              gebaeude === ''
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            Alle Gebäude
            <span className={gebaeude === '' ? 'ml-1.5 opacity-80' : 'ml-1.5 text-muted-foreground'}>
              {gesamtImStatus}
            </span>
          </button>
          {gebaeudeListe.map(g => {
            const aktiv = gebaeude === g.name;
            return (
              <button
                key={g.name}
                type="button"
                onClick={() => setGebaeude(aktiv ? '' : g.name)}
                className={`h-8 rounded-full border px-3 text-[12px] font-medium transition-colors ${
                  aktiv
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                {g.name}
                <span className={aktiv ? 'ml-1.5 opacity-80' : 'ml-1.5 text-muted-foreground'}>
                  {g.anzahl}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Suchen — Titel, Gebäude, Wohnung, letzter Betreff …"
            className="h-9 pl-9 pr-9 text-[13px]"
            aria-label="Vorgänge durchsuchen"
          />
          {suche && (
            <button
              type="button"
              onClick={() => setSuche('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Suche leeren"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusWahl}
            onChange={e => setStatusWahl(e.target.value as StatusWahl)}
            className={auswahlKlasse}
            aria-label="Status"
          >
            {STATUS_WAHL.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={kategorie}
            onChange={e => setKategorie(e.target.value)}
            className={auswahlKlasse}
            aria-label="Kategorie"
          >
            <option value="">Alle Kategorien</option>
            {kategorieListe.map(k => (
              <option key={k} value={k}>
                {CASE_CATEGORY_LABEL[k as CaseCategory] ?? k}
              </option>
            ))}
          </select>

          {([
            ['alle', 'Alle'],
            ['eingang', 'Zuletzt kam etwas rein'],
            ['ohne_wand', 'Auf keiner Wand'],
          ] as [Lage, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setLage(key)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] transition-colors ${
                lage === key
                  ? 'bg-[#2B2B2B] text-white'
                  : 'border border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}

          {filterAktiv && (
            <button
              type="button"
              onClick={zuruecksetzen}
              className="ml-auto text-[12.5px] text-primary hover:underline"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        {filterAktiv && (
          <p className="text-[12px] text-muted-foreground">
            {gefiltert.length} von {faelle.length} Vorgängen
          </p>
        )}
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
                  {sichtbar.map(c => {
                    const erledigt = ['resolved', 'archived'].includes(c.status);
                    return (
                      <article
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/vorgaenge/${c.id}`)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(`/vorgaenge/${c.id}`);
                          }
                        }}
                        aria-label={`Vorgang „${c.title}" öffnen`}
                        className="flex cursor-pointer flex-col gap-3 rounded-[11px] border border-border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex-row lg:items-center"
                      >
                        <div className="min-w-0 lg:w-[320px] lg:shrink-0">
                          <span className="block text-[13.5px] font-semibold leading-snug text-foreground">
                            {c.title}
                          </span>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                            {c.building_name && <span>{c.building_name}</span>}
                            {c.unit_number && <span>· Whg. {c.unit_number}</span>}
                            {c.category && (
                              <span className="rounded bg-muted px-1.5 py-0.5">
                                {CASE_CATEGORY_LABEL[c.category as CaseCategory] ?? c.category}
                              </span>
                            )}
                            {erledigt && (
                              <span className="rounded bg-[#EDF2E6] px-1.5 py-0.5 text-[#4e6b3c]">
                                {STATUS_LABEL[c.status] ?? c.status}
                              </span>
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
                          ) : erledigt ? (
                            <span className="text-[12.5px] text-muted-foreground">abgeschlossen</span>
                          ) : (
                            <span className="text-[12.5px] font-semibold text-[#9C3D24]">
                              auf keiner Wand
                            </span>
                          )}
                        </div>

                        {!erledigt && (
                          // Eigener Klickbereich: die Knöpfe sollen nicht die
                          // Akte öffnen.
                          <div
                            className="flex flex-wrap gap-2 lg:ml-auto"
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => e.stopPropagation()}
                          >
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
                        )}
                      </article>
                    );
                  })}

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
        <div className="py-12 text-center">
          <p className="text-[13px] text-muted-foreground">
            {suche.trim()
              ? `Nichts gefunden zu „${suche.trim()}".`
              : 'Kein Vorgang passt zu dieser Auswahl.'}
          </p>
          {filterAktiv && (
            <button
              type="button"
              onClick={zuruecksetzen}
              className="mt-2 text-[12.5px] text-primary hover:underline"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      )}

      <TodoDialog
        open={neueAufgabe}
        onOpenChange={setNeueAufgabe}
        mode="create"
        vorbelegung={{ buildingId: gebaeudeId }}
      />

    </div>
  );
}
