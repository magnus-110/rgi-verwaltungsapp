import { useEffect, useRef, useState, ReactNode, forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarIcon, FolderKanban, Search, Users, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCasesForPicker } from '@/hooks/useCaseReview';
import { useWallPeople } from '@/hooks/useBoardWalls';
import { formatDateDe } from '@/hooks/useBoardPins';

interface Gebaeude {
  id: string;
  name: string;
}

interface AufgabeBlattProps {
  titel: string;
  beschreibung: string | null;
  gebaeudeIds: string[];
  gebaeude: Gebaeude[];
  /** Wände, an denen die Aufgabe hängt. */
  waende: { userId: string; name: string; initials: string }[];
  dueDate: string | null;
  caseId: string | null;
  erledigt: boolean;
  onTitel: (wert: string) => void;
  onBeschreibung: (wert: string | null) => void;
  onGebaeude: (ids: string[]) => void;
  onDueDate: (wert: string | null) => void;
  onCase: (id: string | null, buildingId?: string | null) => void;
  onWand: (userId: string, anheften: boolean) => void;
}

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  aktiv: boolean;
  icon: ReactNode;
  ton?: 'normal' | 'warnung';
}

/** Dieselbe Pille wie im Schreib-Dialog — nur hier direkt auf der Seite. */
const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ aktiv, icon, ton = 'normal', children, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        ton === 'warnung'
          ? 'border border-[#F0CFC5] bg-[#FBEAE5] text-[#B4472B] hover:bg-[#f7ded6]'
          : aktiv
            ? 'border border-border bg-background text-foreground hover:bg-muted'
            : 'border border-dashed border-[#D5CCBA] bg-transparent text-muted-foreground hover:border-[#C2B79F] hover:text-foreground',
        className
      )}
    >
      {icon}
      {children}
    </button>
  )
);
Chip.displayName = 'Chip';

/** Umlaute und Gross-/Kleinschreibung beim Suchen ignorieren. */
function normal(text: string) {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Das Blatt.
 *
 * Dieselbe Fläche wie beim Schreiben, nur größer: Überschrift, Text, die vier
 * Pillen. Wer eine Aufgabe öffnet, sieht zuerst wieder das, was er
 * geschrieben hat — und ändert es dort, wo es steht. Einen Bearbeiten-Knopf
 * braucht es dafür nicht; ein Dialog, der die Seite verdeckt, erst recht nicht.
 *
 * Gespeichert wird beim Verlassen des Feldes, Escape verwirft. Kein
 * Speichern-Knopf, der vergessen werden kann.
 */
export function AufgabeBlatt({
  titel,
  beschreibung,
  gebaeudeIds,
  gebaeude,
  waende,
  dueDate,
  caseId,
  erledigt,
  onTitel,
  onBeschreibung,
  onGebaeude,
  onDueDate,
  onCase,
  onWand,
}: AufgabeBlattProps) {
  const { user } = useAuth();
  const { data: vorgaenge = [] } = useCasesForPicker();
  const { data: wandLeute = [] } = useWallPeople();

  const [titelEntwurf, setTitelEntwurf] = useState(titel);
  const [textEntwurf, setTextEntwurf] = useState(beschreibung ?? '');
  const [vorgangSuche, setVorgangSuche] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Ändert die Aufgabe sich von außen (anderer Browser, andere Wand), soll
  // der Entwurf mitgehen — solange man nicht selbst gerade darin schreibt.
  useEffect(() => setTitelEntwurf(titel), [titel]);
  useEffect(() => setTextEntwurf(beschreibung ?? ''), [beschreibung]);

  // Das Textfeld wächst mit, statt zu scrollen.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [textEntwurf]);

  const gebaeudeText =
    gebaeudeIds.length === 0
      ? 'Gebäude'
      : gebaeudeIds.length === 1
        ? gebaeude.find(b => b.id === gebaeudeIds[0])?.name ?? '1 Gebäude'
        : `${gebaeudeIds.length} Gebäude`;

  const wandText =
    waende.length === 0
      ? 'an keiner Wand'
      : waende.length === 1
        ? waende[0].userId === user?.id
          ? 'meine Wand'
          : `Wand von ${waende[0].name.split(' ')[0]}`
        : `${waende.length} Wände`;

  const heute = new Date().toISOString().slice(0, 10);
  const ueberfaellig = !!dueDate && dueDate < heute && !erledigt;
  const vorgang = vorgaenge.find(v => v.id === caseId);

  const gefundene = (() => {
    const woerter = normal(vorgangSuche.trim()).split(/\s+/).filter(Boolean);
    const liste = woerter.length
      ? vorgaenge.filter(v => {
          const heuhaufen = normal(
            [v.title, v.building_name, v.unit_number].filter(Boolean).join(' ')
          );
          return woerter.every(w => heuhaufen.includes(w));
        })
      : vorgaenge;
    return liste.slice(0, 40);
  })();

  return (
    <div className="rounded-xl border border-[#EBE4D6] bg-[#FFFDF7] p-5 shadow-[0_1px_2px_rgba(43,43,43,.05)] lg:p-6">
      <label htmlFor="aufgabe-titel" className="sr-only">
        Überschrift der Aufgabe
      </label>
      <input
        id="aufgabe-titel"
        value={titelEntwurf}
        onChange={e => setTitelEntwurf(e.target.value)}
        onBlur={() => {
          const wert = titelEntwurf.trim();
          if (!wert) {
            setTitelEntwurf(titel);
            return;
          }
          if (wert !== titel) onTitel(wert);
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            setTitelEntwurf(titel);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          'w-full rounded-md border-none bg-transparent p-0 text-[24px] font-semibold leading-tight text-foreground outline-none',
          'focus:bg-white/60 focus:px-1.5 focus:py-0.5 focus:ring-2 focus:ring-primary',
          erledigt && 'text-muted-foreground line-through'
        )}
      />

      <label htmlFor="aufgabe-text" className="sr-only">
        Beschreibung
      </label>
      <textarea
        id="aufgabe-text"
        ref={textRef}
        value={textEntwurf}
        onChange={e => setTextEntwurf(e.target.value)}
        onBlur={() => {
          const wert = textEntwurf.trim();
          if (wert !== (beschreibung ?? '')) onBeschreibung(wert || null);
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            setTextEntwurf(beschreibung ?? '');
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        rows={1}
        placeholder="Beschreibung hinzufügen …"
        className="mt-2.5 w-full resize-none overflow-hidden rounded-md border-none bg-transparent p-0 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:bg-white/60 focus:px-1.5 focus:py-0.5 focus:ring-2 focus:ring-primary"
      />

      <div className="my-4 h-px bg-[#EBE4D6]" />

      <div className="flex flex-wrap gap-2">
        {/* Gebäude */}
        <Popover>
          <PopoverTrigger asChild>
            <Chip
              aria-label="Gebäude wählen"
              aktiv={gebaeudeIds.length > 0}
              icon={<Building2 className="h-3.5 w-3.5" />}
            >
              {gebaeudeText}
            </Chip>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-2" align="start">
            <div className="max-h-[240px] space-y-1 overflow-y-auto">
              {gebaeude.map(b => (
                <div
                  key={b.id}
                  className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
                  onClick={() =>
                    onGebaeude(
                      gebaeudeIds.includes(b.id)
                        ? gebaeudeIds.filter(x => x !== b.id)
                        : [...gebaeudeIds, b.id]
                    )
                  }
                >
                  <Checkbox checked={gebaeudeIds.includes(b.id)} />
                  <span className="text-sm">{b.name}</span>
                </div>
              ))}
            </div>
            {gebaeudeIds.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => onGebaeude([])}
              >
                Auswahl aufheben
              </Button>
            )}
          </PopoverContent>
        </Popover>

        {/* Wände */}
        <Popover>
          <PopoverTrigger asChild>
            <Chip
              aria-label="Wand wählen"
              aktiv={waende.length > 0}
              icon={<Users className="h-3.5 w-3.5" />}
            >
              {wandText}
            </Chip>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-2" align="start">
            <p className="px-2 pb-1.5 pt-1 text-[11.5px] leading-snug text-muted-foreground">
              An wessen Wand soll sie hängen?
            </p>
            <div className="max-h-[240px] space-y-1 overflow-y-auto">
              {wandLeute.map(p => {
                const haengt = waende.some(w => w.userId === p.userId);
                return (
                  <div
                    key={p.userId}
                    className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
                    onClick={() => onWand(p.userId, !haengt)}
                  >
                    <Checkbox checked={haengt} />
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#2B2B2B] text-[9.5px] font-semibold text-white">
                      {p.initials}
                    </span>
                    <span className="text-sm">
                      {p.name}
                      {p.userId === user?.id && <span className="text-muted-foreground"> (du)</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 border-t border-border pt-2 text-[11.5px] leading-snug text-muted-foreground">
              Wer nicht du selbst ist, bekommt eine Meldung.
            </p>
          </PopoverContent>
        </Popover>

        {/* Termin */}
        <Popover>
          <PopoverTrigger asChild>
            <Chip
              aria-label="Termin wählen"
              aktiv={!!dueDate}
              ton={ueberfaellig ? 'warnung' : 'normal'}
              icon={<CalendarIcon className="h-3.5 w-3.5" />}
            >
              {dueDate
                ? `${ueberfaellig ? 'überfällig seit' : 'fällig'} ${formatDateDe(dueDate)}`
                : 'ohne Termin'}
            </Chip>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dueDate ? new Date(dueDate) : undefined}
              onSelect={d => onDueDate(d ? format(d, 'yyyy-MM-dd') : null)}
              initialFocus
              locale={de}
            />
            <div className="border-t border-border p-2">
              <p className="px-1 pb-2 text-[11.5px] leading-snug text-muted-foreground">
                Nur setzen, wenn das Datum eine echte Konsequenz hat.
              </p>
              {dueDate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => onDueDate(null)}
                >
                  Termin entfernen
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Vorgang */}
        <Popover>
          <PopoverTrigger asChild>
            <Chip
              aria-label="Vorgang wählen"
              aktiv={!!caseId}
              icon={<FolderKanban className="h-3.5 w-3.5" />}
            >
              <span className="max-w-[220px] truncate">
                {vorgang ? vorgang.title : caseId ? 'Vorgang' : 'kein Vorgang'}
              </span>
            </Chip>
          </PopoverTrigger>
          <PopoverContent className="w-[340px] p-2" align="start">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={vorgangSuche}
                onChange={e => setVorgangSuche(e.target.value)}
                placeholder="Vorgang suchen …"
                className="h-8 pl-8 text-[12.5px]"
                aria-label="Vorgang suchen"
              />
            </div>

            {caseId && (
              <>
                <Link
                  to={`/vorgaenge/${caseId}`}
                  className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12.5px] text-primary hover:bg-muted"
                >
                  <FolderKanban className="h-3.5 w-3.5" /> Vorgang öffnen
                </Link>
                <button
                  type="button"
                  onClick={() => onCase(null)}
                  className="mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" /> Verknüpfung lösen
                </button>
              </>
            )}

            <div className="max-h-[220px] space-y-0.5 overflow-y-auto">
              {gefundene.length === 0 && (
                <p className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">
                  Kein offener Vorgang gefunden.
                </p>
              )}
              {gefundene.map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onCase(v.id, v.building_id)}
                  className={cn(
                    'flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-muted',
                    v.id === caseId && 'bg-muted'
                  )}
                >
                  <span className="text-[13px] leading-snug text-foreground">{v.title}</span>
                  {(v.building_name || v.unit_number) && (
                    <span className="text-[11.5px] text-muted-foreground">
                      {[v.building_name, v.unit_number ? `Whg. ${v.unit_number}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <p className="mt-2 border-t border-border pt-2 text-[11.5px] leading-snug text-muted-foreground">
              Wird die Aufgabe erledigt, steht das im Verlauf des Vorgangs.
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
