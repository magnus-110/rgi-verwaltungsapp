import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Image as ImageIcon,
  Lock,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import {
  type GebaeudeKurz,
  istBild,
  type Notiz,
  type NotizBereich,
  type NotizEingabe,
  nurText,
  useAnhangAktionen,
  useNotizAktionen,
  useNotizBereiche,
  useNotizen,
  useNotizGebaeude,
  useNotizPersonen,
} from '@/hooks/useNotizbuch';
import { NotizEditor } from '@/components/notizbuch/NotizEditor';
import { NotizAnhaenge } from '@/components/notizbuch/NotizAnhaenge';
import { BereicheDialog } from '@/components/notizbuch/BereicheDialog';
import {
  NOTIZ_TEXT_KLASSEN,
  notizHtmlBereinigen,
  notizHtmlZumAnzeigen,
} from '@/components/notizbuch/notizHtml';

/**
 * Notizbuch (Wissen → Notizbuch).
 *
 * Dauerhaftes Büro-Wissen zum Nachschlagen — mit Bildern und Dateien.
 * Eine Notiz gehört zu einem Gebäude oder zu einem Bereich. Gebäude-Notizen
 * erscheinen zusätzlich im Reiter „Notizen" beim Gebäude.
 *
 * Adresse:
 *   ?notiz=<id>               diese Notiz öffnen
 *   ?gebaeude=<id>            nach Gebäude filtern
 *   ?neu=1&gebaeude=<id>      neue Notiz für dieses Gebäude
 */

type Filter =
  | { art: 'alle' }
  | { art: 'angeheftet' }
  | { art: 'meine' }
  | { art: 'bereich'; id: string }
  | { art: 'gebaeude'; id: string };

type Modus = { art: 'bearbeiten'; id: string } | { art: 'neu' } | null;

function datum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function GebaeudeIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return <Building2 className={className} aria-hidden="true" />;
}

/** Bei übernommenen Notizen steht der Text oft noch einmal als Titel. */
function textOhneTitel(n: Notiz) {
  const text = nurText(n.content);
  return text === n.title.trim() ? '' : text;
}

// ------------------------------------------------------------------ Seite

/**
 * Zwei Ansichten, damit nicht zu viel auf einmal auf dem Bildschirm steht:
 *   1. Übersicht: Filter links, Notizen als Karten rechts.
 *   2. Eine Notiz groß — zum Lesen oder Bearbeiten. „Zurück" führt zur Übersicht.
 */
export default function Notizbuch() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: notizen = [], isLoading } = useNotizen();
  const { data: bereiche = [] } = useNotizBereiche();
  const { data: gebaeude = [] } = useNotizGebaeude();
  const { data: personen = {} } = useNotizPersonen();
  const aktionen = useNotizAktionen();

  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState<Filter>(() => {
    const g = params.get('gebaeude');
    return g && !params.get('neu') ? { art: 'gebaeude', id: g } : { art: 'alle' };
  });
  const [thema, setThema] = useState<string | null>(null);
  const [modus, setModus] = useState<Modus>(() => (params.get('neu') ? { art: 'neu' } : null));
  const [neuFuerGebaeude] = useState<string | null>(() =>
    params.get('neu') ? params.get('gebaeude') : null,
  );
  const [bereicheOffen, setBereicheOffen] = useState(false);
  const [ungespeichert, setUngespeichert] = useState(false);

  // Die geöffnete Notiz steht in der Adresse — so klappt auch der Zurück-Knopf des Browsers.
  const offenId = params.get('notiz');

  // "neu" nach dem ersten Lesen aus der Adresse nehmen, damit Neuladen nicht erneut "neu" öffnet.
  useEffect(() => {
    if (params.get('neu')) {
      const p = new URLSearchParams(params);
      p.delete('neu');
      p.delete('gebaeude');
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bereichMap = useMemo(() => Object.fromEntries(bereiche.map(b => [b.id, b])), [bereiche]);
  const gebaeudeMap = useMemo(() => Object.fromEntries(gebaeude.map(g => [g.id, g])), [gebaeude]);

  /** In einem Bereich zählen nur Notizen ohne Gebäude. */
  const anzahlBereich = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of notizen) if (n.area_id && !n.building_id) m[n.area_id] = (m[n.area_id] ?? 0) + 1;
    return m;
  }, [notizen]);

  /** Für den Bereiche-Dialog: alle Notizen, auch Gebäude-Notizen mit diesem Thema. */
  const nutzungBereich = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of notizen) if (n.area_id) m[n.area_id] = (m[n.area_id] ?? 0) + 1;
    return m;
  }, [notizen]);

  const gebaeudeMitNotizen = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of notizen) if (n.building_id) m[n.building_id] = (m[n.building_id] ?? 0) + 1;
    return gebaeude.filter(g => m[g.id]).map(g => ({ ...g, anzahl: m[g.id] }));
  }, [notizen, gebaeude]);

  const imFilter = useMemo(
    () =>
      notizen.filter(n => {
        switch (filter.art) {
          case 'angeheftet': return n.pinned;
          case 'meine': return n.is_private;
          case 'bereich': return n.area_id === filter.id && !n.building_id;
          case 'gebaeude': return n.building_id === filter.id;
          default: return true;
        }
      }),
    [notizen, filter],
  );

  /** Themen innerhalb des gewählten Gebäudes, als kleine Knöpfe über der Liste. */
  const themenImGebaeude = useMemo(() => {
    if (filter.art !== 'gebaeude') return [];
    const zahl: Record<string, number> = {};
    for (const n of imFilter) if (n.area_id) zahl[n.area_id] = (zahl[n.area_id] ?? 0) + 1;
    return bereiche.filter(b => zahl[b.id]).map(b => ({ ...b, anzahl: zahl[b.id] }));
  }, [filter, imFilter, bereiche]);

  const sichtbar = useMemo(() => {
    const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
    return imFilter
      .filter(n => filter.art !== 'gebaeude' || !thema || n.area_id === thema)
      .filter(n => {
        if (!woerter.length) return true;
        const text = [
          n.title,
          nurText(n.content),
          n.building_id ? gebaeudeMap[n.building_id]?.name : '',
          n.area_id ? bereichMap[n.area_id]?.name : '',
          ...n.anhaenge.map(a => a.file_name),
        ]
          .join(' ')
          .toLowerCase();
        return woerter.every(w => text.includes(w));
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updated_at.localeCompare(a.updated_at);
      });
  }, [imFilter, filter, thema, suche, gebaeudeMap, bereichMap]);

  const offeneNotiz =
    modus?.art === 'bearbeiten'
      ? notizen.find(n => n.id === modus.id) ?? null
      : offenId
        ? notizen.find(n => n.id === offenId) ?? null
        : null;

  const darfWechseln = () =>
    !ungespeichert || confirm('Deine Änderungen sind noch nicht gespeichert. Trotzdem verlassen?');

  const notizOeffnen = (id: string) => {
    const p = new URLSearchParams(params);
    p.set('notiz', id);
    setParams(p);
    window.scrollTo({ top: 0 });
  };

  const zurUebersicht = () => {
    if (!darfWechseln()) return;
    setUngespeichert(false);
    setModus(null);
    if (params.get('notiz')) {
      const p = new URLSearchParams(params);
      p.delete('notiz');
      setParams(p);
    }
  };

  const filterSetzen = (f: Filter) => {
    setFilter(f);
    setThema(null);
  };

  const neueNotiz = () => {
    setUngespeichert(false);
    setModus({ art: 'neu' });
    window.scrollTo({ top: 0 });
  };

  /** Vorbelegung einer neuen Notiz aus dem aktuellen Filter. */
  const neuVorlage: NotizEingabe = {
    title: '',
    content: '',
    building_id: neuFuerGebaeude ?? (filter.art === 'gebaeude' ? filter.id : null),
    area_id: filter.art === 'bereich' ? filter.id : filter.art === 'gebaeude' ? thema : null,
    is_private: filter.art === 'meine',
    pinned: false,
  };

  // ---------------------------------------------------- Ansicht 2: eine Notiz groß
  if (modus || offenId) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <button
          type="button"
          onClick={zurUebersicht}
          className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-md pr-2 text-[13.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
        </button>

        {modus ? (
          <NotizFormular
            key={modus.art === 'neu' ? 'neu' : modus.id}
            notiz={modus.art === 'bearbeiten' ? offeneNotiz : null}
            vorlage={neuVorlage}
            bereiche={bereiche}
            gebaeude={gebaeude}
            anzahlBereich={nutzungBereich}
            istErsteller={modus.art === 'neu' || offeneNotiz?.created_by === user?.id}
            onGeaendert={setUngespeichert}
            onAbbrechen={() => {
              setUngespeichert(false);
              setModus(null);
            }}
            onGespeichert={id => {
              setUngespeichert(false);
              setModus(null);
              const p = new URLSearchParams(params);
              p.set('notiz', id);
              setParams(p, { replace: true });
            }}
          />
        ) : offeneNotiz ? (
          <NotizLesen
            notiz={offeneNotiz}
            bereich={offeneNotiz.area_id ? bereichMap[offeneNotiz.area_id] : undefined}
            gebaeude={offeneNotiz.building_id ? gebaeudeMap[offeneNotiz.building_id] : undefined}
            personen={personen}
            onBearbeiten={() => setModus({ art: 'bearbeiten', id: offeneNotiz.id })}
            onAnheften={() => aktionen.anheften.mutate({ id: offeneNotiz.id, pinned: !offeneNotiz.pinned })}
            onLoeschen={() => {
              if (confirm(`Notiz „${offeneNotiz.title}“ wirklich löschen? Bilder und Dateien werden mit gelöscht.`)) {
                aktionen.loeschen.mutate(offeneNotiz, { onSuccess: zurUebersicht });
              }
            }}
          />
        ) : isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-[13.5px] text-muted-foreground">
            Diese Notiz gibt es nicht mehr oder sie ist nur für jemand anderen sichtbar.
          </div>
        )}

        <BereicheDialog
          open={bereicheOffen}
          onOpenChange={setBereicheOffen}
          bereiche={bereiche}
          anzahl={nutzungBereich}
        />
      </div>
    );
  }

  // ---------------------------------------------------- Ansicht 1: Übersicht
  const filterKnopf = (aktiv: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] transition-colors ${
      aktiv ? 'bg-muted font-semibold text-foreground' : 'text-foreground hover:bg-muted/60'
    }`;

  const ueberschrift =
    filter.art === 'alle' ? 'Alle Notizen'
    : filter.art === 'angeheftet' ? 'Angeheftet'
    : filter.art === 'meine' ? 'Nur für mich'
    : filter.art === 'bereich' ? bereichMap[filter.id]?.name ?? 'Bereich'
    : gebaeudeMap[filter.id]?.name ?? 'Gebäude';

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      {/* Kopf */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold text-foreground">Notizbuch</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Dauerhaftes Büro-Wissen zum Nachschlagen – mit Bildern und Dateien.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBereicheOffen(true)}>
            <Settings2 className="mr-2 h-4 w-4" /> Bereiche
          </Button>
          <Button onClick={neueNotiz}>
            <Plus className="mr-2 h-4 w-4" /> Neue Notiz
          </Button>
        </div>
      </div>

      <label className="mb-5 flex h-12 items-center gap-3 rounded-lg border border-border bg-card px-4 shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Notizen durchsuchen</span>
        <input
          type="search"
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Was suchst du? z. B. „Heizung“, „Grundbuchamt“, „Müll“ …"
          className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted-foreground"
        />
      </label>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Filter */}
        <nav aria-label="Notizen filtern" className="lg:w-[230px] lg:flex-none">
          <div className="flex flex-col gap-0.5">
            <button type="button" className={filterKnopf(filter.art === 'alle')} onClick={() => filterSetzen({ art: 'alle' })}>
              <span className="flex-1">Alle Notizen</span>
              <span className="text-muted-foreground">{notizen.length}</span>
            </button>
            <button type="button" className={filterKnopf(filter.art === 'angeheftet')} onClick={() => filterSetzen({ art: 'angeheftet' })}>
              <Pin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="flex-1">Angeheftet</span>
              <span className="text-muted-foreground">{notizen.filter(n => n.pinned).length}</span>
            </button>
            <button type="button" className={filterKnopf(filter.art === 'meine')} onClick={() => filterSetzen({ art: 'meine' })}>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">Nur für mich</span>
              <span className="text-muted-foreground">{notizen.filter(n => n.is_private).length}</span>
            </button>
          </div>

          <div className="mb-1.5 mt-5 pl-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Gebäude
          </div>
          <Select
            value={filter.art === 'gebaeude' ? filter.id : ''}
            onValueChange={v => filterSetzen({ art: 'gebaeude', id: v })}
          >
            <SelectTrigger
              aria-label="Gebäude wählen"
              className={`h-10 ${filter.art === 'gebaeude' ? 'border-primary font-semibold' : ''}`}
            >
              <SelectValue placeholder="Gebäude wählen …" />
            </SelectTrigger>
            <SelectContent>
              {gebaeudeMitNotizen.map(g => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name} ({g.anzahl})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mb-1 mt-5 flex items-center justify-between pl-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bereiche</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary"
              aria-label="Bereiche verwalten"
              onClick={() => setBereicheOffen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-0.5">
            {bereiche.map(b => (
              <button
                key={b.id}
                type="button"
                className={filterKnopf(filter.art === 'bereich' && filter.id === b.id)}
                onClick={() => filterSetzen({ art: 'bereich', id: b.id })}
              >
                <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: b.color }} />
                <span className="flex-1 truncate">{b.name}</span>
                <span className="text-muted-foreground">{anzahlBereich[b.id] ?? 0}</span>
              </button>
            ))}
            {bereiche.length === 0 && (
              <p className="px-2.5 py-1 text-[12.5px] text-muted-foreground">Noch keine Bereiche.</p>
            )}
          </div>
        </nav>

        {/* Notizen */}
        <section aria-label="Notizen" className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-foreground">
              {filter.art === 'gebaeude' && <GebaeudeIcon className="mr-1.5 inline h-4 w-4 align-[-2px]" />}
              {ueberschrift}
            </h2>
            <span className="text-[12.5px] text-muted-foreground">
              {sichtbar.length === 1 ? '1 Notiz' : `${sichtbar.length} Notizen`}
            </span>
          </div>

          {themenImGebaeude.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setThema(null)}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] ${
                  thema === null ? 'border-foreground bg-foreground font-semibold text-background' : 'border-border bg-background hover:bg-muted'
                }`}
              >
                Alle Themen
              </button>
              {themenImGebaeude.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setThema(t.id)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] ${
                    thema === t.id ? 'border-foreground bg-foreground font-semibold text-background' : 'border-border bg-background hover:bg-muted'
                  }`}
                >
                  {thema !== t.id && <span className="h-2 w-2 rounded-[2px]" style={{ background: t.color }} />}
                  {t.name} <span className="opacity-70">{t.anzahl}</span>
                </button>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[110px] w-full rounded-lg" />)}
            </div>
          )}
          {!isLoading && sichtbar.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted-foreground">
              {suche ? 'Nichts gefunden.' : 'Hier liegen noch keine Notizen.'}
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={neueNotiz}>
                  <Plus className="mr-1.5 h-4 w-4" /> Neue Notiz
                </Button>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sichtbar.map(n => (
              <NotizKarte
                key={n.id}
                notiz={n}
                bereich={n.area_id ? bereichMap[n.area_id] : undefined}
                gebaeude={n.building_id && filter.art !== 'gebaeude' ? gebaeudeMap[n.building_id] : undefined}
                onClick={() => notizOeffnen(n.id)}
              />
            ))}
          </div>
        </section>
      </div>

      <BereicheDialog
        open={bereicheOffen}
        onOpenChange={setBereicheOffen}
        bereiche={bereiche}
        anzahl={nutzungBereich}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Karte

function Zuordnung({
  bereich,
  gebaeude,
}: {
  bereich?: NotizBereich;
  gebaeude?: GebaeudeKurz;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {gebaeude && (
        <span className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-foreground">
          <GebaeudeIcon className="h-3 w-3 flex-none" />
          <span className="truncate">{gebaeude.name}</span>
        </span>
      )}
      {bereich && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 flex-none rounded-[2px]" style={{ background: bereich.color }} />
          {bereich.name}
        </span>
      )}
    </span>
  );
}

function NotizKarte({
  notiz,
  bereich,
  gebaeude,
  onClick,
}: {
  notiz: Notiz;
  bereich?: NotizBereich;
  gebaeude?: GebaeudeKurz;
  onClick: () => void;
}) {
  const vorschau = textOhneTitel(notiz).slice(0, 160);
  const bilder = notiz.anhaenge.filter(istBild).length;
  const dateien = notiz.anhaenge.length - bilder;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-full flex-col gap-1.5 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-start gap-2">
        <span className="flex-1 text-[14px] font-semibold leading-snug text-foreground">{notiz.title}</span>
        {notiz.is_private && <Lock className="mt-0.5 h-3.5 w-3.5 flex-none text-muted-foreground" aria-label="Nur für mich" />}
        {notiz.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 flex-none fill-primary text-primary" aria-label="Angeheftet" />}
      </span>
      {vorschau && <span className="line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{vorschau}</span>}
      <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <Zuordnung bereich={bereich} gebaeude={gebaeude} />
        <span className="ml-auto flex flex-none items-center gap-2">
          {bilder > 0 && (
            <span className="inline-flex items-center gap-0.5" aria-label={`${bilder} Bilder`}>
              <ImageIcon className="h-3 w-3" aria-hidden="true" />{bilder}
            </span>
          )}
          {dateien > 0 && (
            <span className="inline-flex items-center gap-0.5" aria-label={`${dateien} Dateien`}>
              <Paperclip className="h-3 w-3" aria-hidden="true" />{dateien}
            </span>
          )}
          {datum(notiz.updated_at)}
        </span>
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ Lesen

function NotizLesen({
  notiz,
  bereich,
  gebaeude,
  personen,
  onBearbeiten,
  onAnheften,
  onLoeschen,
}: {
  notiz: Notiz;
  bereich?: NotizBereich;
  gebaeude?: GebaeudeKurz;
  personen: Record<string, string>;
  onBearbeiten: () => void;
  onAnheften: () => void;
  onLoeschen: () => void;
}) {
  const html = useMemo(() => notizHtmlZumAnzeigen(notiz.content), [notiz.content]);
  const zeigeText = textOhneTitel(notiz) !== '';
  const wer = notiz.updated_by ? personen[notiz.updated_by] : undefined;

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-1.5 text-[12px]">
            {gebaeude && (
              <Link
                to={`/buildings/${gebaeude.id}?tab=notes`}
                className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-medium text-foreground hover:underline"
              >
                <GebaeudeIcon className="h-3 w-3" /> {gebaeude.name}
              </Link>
            )}
            {bereich && (
              <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-0.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: bereich.color }} />
                {gebaeude ? `Thema: ${bereich.name}` : bereich.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5">
              {notiz.is_private ? (<><Lock className="h-3 w-3" /> Nur für mich</>) : 'Für alle'}
            </span>
          </div>
          <h2 className="text-[22px] font-semibold leading-snug text-foreground">{notiz.title}</h2>
          <p className="text-[12px] text-muted-foreground">
            Zuletzt geändert am {datum(notiz.updated_at)}
            {wer ? ` von ${wer}` : ''} · angelegt {datum(notiz.created_at)}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10"
            aria-label={notiz.pinned ? 'Nicht mehr anheften' : 'Anheften'}
            title={notiz.pinned ? 'Nicht mehr anheften' : 'Oben anheften'}
            onClick={onAnheften}
          >
            {notiz.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={onBearbeiten}>
            <Pencil className="mr-2 h-4 w-4" /> Bearbeiten
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label="Weitere Aktionen">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onLoeschen}>
                <Trash2 className="mr-2 h-4 w-4" /> Notiz löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {zeigeText && (
        <div className={`${NOTIZ_TEXT_KLASSEN} mt-6 max-w-3xl text-[15px]`} dangerouslySetInnerHTML={{ __html: html }} />
      )}

      {notiz.anhaenge.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Bilder und Dateien
          </div>
          <NotizAnhaenge anhaenge={notiz.anhaenge} />
        </div>
      )}
    </article>
  );
}

// ------------------------------------------------------------------ Bearbeiten

function NotizFormular({
  notiz,
  vorlage,
  bereiche,
  gebaeude,
  anzahlBereich,
  istErsteller,
  onGeaendert,
  onAbbrechen,
  onGespeichert,
}: {
  notiz: Notiz | null;
  vorlage: NotizEingabe;
  bereiche: NotizBereich[];
  gebaeude: GebaeudeKurz[];
  anzahlBereich: Record<string, number>;
  istErsteller: boolean;
  onGeaendert: (v: boolean) => void;
  onAbbrechen: () => void;
  onGespeichert: (id: string) => void;
}) {
  const { anlegen, speichern } = useNotizAktionen();
  const anhaenge = useAnhangAktionen();

  const start: NotizEingabe = notiz
    ? {
        title: notiz.title,
        content: notiz.content,
        area_id: notiz.area_id,
        building_id: notiz.building_id,
        is_private: notiz.is_private,
        pinned: notiz.pinned,
      }
    : vorlage;

  const [werte, setWerte] = useState<NotizEingabe>(start);
  const [ort, setOrt] = useState<'gebaeude' | 'bereich'>(start.building_id ? 'gebaeude' : 'bereich');
  /** Dateien einer neuen Notiz — werden nach dem ersten Speichern hochgeladen. */
  const [wartend, setWartend] = useState<File[]>([]);
  const [bereicheOffen, setBereicheOffen] = useState(false);

  const setzen = (teil: Partial<NotizEingabe>) => {
    setWerte(w => ({ ...w, ...teil }));
    onGeaendert(true);
  };

  const dateienDazu = (files: File[]) => {
    if (!files.length) return;
    if (notiz) anhaenge.hochladen.mutate({ noteId: notiz.id, files });
    else {
      setWartend(w => [...w, ...files]);
      onGeaendert(true);
    }
  };

  const ortWechseln = (neu: 'gebaeude' | 'bereich') => {
    setOrt(neu);
    if (neu === 'bereich') setzen({ building_id: null });
  };

  const speichernKlick = async () => {
    const eingabe: NotizEingabe = {
      ...werte,
      content: notizHtmlBereinigen(werte.content),
      building_id: ort === 'gebaeude' ? werte.building_id : null,
    };
    if (ort === 'gebaeude' && !eingabe.building_id) {
      alert('Bitte ein Gebäude auswählen.');
      return;
    }
    if (ort === 'bereich' && !eingabe.area_id) {
      alert('Bitte einen Bereich auswählen.');
      return;
    }
    try {
      if (notiz) {
        await speichern.mutateAsync({ id: notiz.id, ...eingabe });
        onGespeichert(notiz.id);
      } else {
        const id = await anlegen.mutateAsync(eingabe);
        if (wartend.length) await anhaenge.hochladen.mutateAsync({ noteId: id, files: wartend });
        onGespeichert(id);
      }
    } catch {
      // Hinweis kommt bereits aus der Datenschicht
    }
  };

  const speichertGerade = anlegen.isPending || speichern.isPending || anhaenge.hochladen.isPending;

  const chip = (aktiv: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors ${
      aktiv
        ? 'border-primary bg-primary font-semibold text-primary-foreground'
        : 'border-border bg-background text-foreground hover:bg-muted'
    }`;

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      {/* Schreibfläche */}
      <section aria-label="Notiz-Inhalt" className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="px-5 pb-2 pt-4">
          <label htmlFor="notiz-titel" className="sr-only">Titel</label>
          <input
            id="notiz-titel"
            value={werte.title}
            onChange={e => setzen({ title: e.target.value })}
            placeholder="Titel, z. B. „Heizung: Störung zurücksetzen“"
            autoFocus={!notiz}
            className="w-full bg-transparent py-1 text-[20px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
          />
        </div>
        <NotizEditor
          initialHtml={start.content}
          onChange={html => setzen({ content: html })}
          onDateien={dateienDazu}
        />
        {(notiz?.anhaenge.length || wartend.length) ? (
          <div className="border-t border-border px-5 py-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bilder und Dateien
            </div>
            {notiz && <NotizAnhaenge anhaenge={notiz.anhaenge} bearbeitbar />}
            {wartend.length > 0 && (
              <ul className="space-y-1.5">
                {wartend.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-[13px]">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1 truncate">{f.name || 'Bildschirmfoto'}</span>
                    <span className="text-[12px] text-muted-foreground">wird beim Speichern hochgeladen</span>
                    <button
                      type="button"
                      className="text-[12px] text-muted-foreground hover:text-foreground"
                      onClick={() => setWartend(w => w.filter((_, j) => j !== i))}
                    >
                      Entfernen
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {anhaenge.hochladen.isPending && (
          <p className="px-5 pb-3 text-[12.5px] text-muted-foreground">Lade hoch …</p>
        )}
      </section>

      {/* Einstellungen */}
      <aside aria-label="Einstellungen der Notiz" className="flex flex-col gap-4 xl:w-[320px] xl:flex-none">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[13px] font-semibold">Wohin gehört die Notiz?</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup">
              {(['gebaeude', 'bereich'] as const).map(o => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={ort === o}
                  onClick={() => ortWechseln(o)}
                  className={`flex min-h-10 items-center justify-center gap-2 rounded-md text-[13.5px] ${
                    ort === o ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {o === 'gebaeude' ? (<><GebaeudeIcon className="h-4 w-4" /> Gebäude</>) : 'Bereich'}
                </button>
              ))}
            </div>
          </fieldset>

          {ort === 'gebaeude' && (
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold" htmlFor="notiz-gebaeude">Gebäude</label>
              <Select
                value={werte.building_id ?? undefined}
                onValueChange={v => setzen({ building_id: v })}
              >
                <SelectTrigger id="notiz-gebaeude" className="h-11">
                  <SelectValue placeholder="Gebäude auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {gebaeude.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">
                Die Notiz erscheint dann auch beim Gebäude im Reiter „Notizen“.
              </p>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="mb-2 text-[13px] font-semibold">
              {ort === 'gebaeude' ? (
                <>Thema <span className="font-normal text-muted-foreground">(freiwillig)</span></>
              ) : (
                'Bereich'
              )}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {bereiche.map(b => {
                const aktiv = werte.area_id === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={aktiv}
                    className={chip(aktiv)}
                    onClick={() =>
                      setzen({ area_id: aktiv && ort === 'gebaeude' ? null : b.id })
                    }
                  >
                    {!aktiv && <span className="h-2 w-2 rounded-[2px]" style={{ background: b.color }} />}
                    {b.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setBereicheOffen(true)}
                className="inline-flex min-h-9 items-center rounded-full border border-dashed border-border px-3 text-[13px] text-muted-foreground hover:bg-muted"
              >
                + Neuer Bereich
              </button>
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="mb-2 text-[13px] font-semibold">Wer darf sie sehen?</legend>
            {[
              { wert: false, text: 'Für alle im Büro' },
              { wert: true, text: 'Nur für mich' },
            ].map(o => (
              <label
                key={String(o.wert)}
                className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-[13.5px] ${
                  werte.is_private === o.wert ? 'border-primary bg-primary/5' : 'border-border'
                } ${!istErsteller && o.wert ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <input
                  type="radio"
                  name="sichtbarkeit"
                  checked={werte.is_private === o.wert}
                  disabled={!istErsteller && o.wert}
                  onChange={() => setzen({ is_private: o.wert })}
                  className="accent-[hsl(var(--primary))]"
                />
                {o.text}
              </label>
            ))}
            {!istErsteller && (
              <p className="text-[12px] text-muted-foreground">
                „Nur für mich“ kann nur einstellen, wer die Notiz angelegt hat.
              </p>
            )}
          </fieldset>

          <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3">
            <span className="text-[13px] font-semibold">Oben anheften</span>
            <Switch checked={werte.pinned} onCheckedChange={v => setzen({ pinned: v })} />
          </label>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-[12.5px] leading-snug text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <span>Bitte keine Passwörter ins Notizbuch schreiben – die gehören in den Passwort-Manager.</span>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onAbbrechen} disabled={speichertGerade}>
            Abbrechen
          </Button>
          <Button type="button" className="flex-1" onClick={speichernKlick} disabled={speichertGerade}>
            {speichertGerade ? 'Speichert …' : 'Speichern'}
          </Button>
        </div>
      </aside>

      <BereicheDialog
        open={bereicheOffen}
        onOpenChange={setBereicheOffen}
        bereiche={bereiche}
        anzahl={anzahlBereich}
        onAngelegt={b => {
          setzen({ area_id: b.id });
          setBereicheOffen(false);
        }}
      />
    </div>
  );
}
