import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, GripVertical, Plus, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  BoardItem,
  BoardRefType,
  daysSince,
  useBoardPins,
  useBoardSupply,
  useCompleteBoardItem,
  useDeleteSupplyTodo,
  usePinToWall,
  useReorderPin,
  useSetWaiting,
  useUnpin,
} from '@/hooks/useBoardPins';
import { BoardCard } from '@/components/board/BoardCard';
import { BoardSupply } from '@/components/board/BoardSupply';
import { TodoDialog } from '@/components/todos/TodoDialog';
import { WaitingDialog } from '@/components/board/WaitingDialog';
import { BoardTeam } from '@/components/board/BoardTeam';
import { DoneDialog } from '@/components/board/DoneDialog';
import { useRestoreBoardItem } from '@/hooks/useBoardDone';
import { SpartenDialog } from '@/components/board/SpartenDialog';
import {
  sparteDot,
  sparteIdVon,
  useBoardSparten,
  useSetPinSparte,
  useSetRefSparte,
  type BoardSparte,
} from '@/hooks/useBoardSparten';

/**
 * Die Pinnwand.
 *
 * Dauerhaft, nicht tagesbezogen: kein Reset über Nacht. Aufgaben bleiben hängen,
 * bis jemand sie abnimmt. Was hier liegt, hat ein Mensch hierher gezogen.
 *
 * Gezogen wird mit den Bordmitteln des Browsers statt mit einer Bibliothek:
 * Die Wand ist ein Raster mit unterschiedlich hohen Karten, und genau damit
 * kommen die üblichen Listen-Bibliotheken nicht zurecht — die Vorschau sprang
 * beim Umbruch in die nächste Zeile. So funktioniert es in jedem Layout, und
 * dieselbe Geste holt auch eine Aufgabe aus dem Vorrat herüber.
 *
 * Auf dem Handy gibt es kein Ziehen; dort stehen im Menü der Karte
 * „Weiter nach vorne / nach hinten" und im Vorrat weiterhin der „+"-Knopf.
 */

/** Was gerade am Mauszeiger hängt. */
type Zug =
  | { art: 'wand'; sektion: string; index: number; pinId: string }
  | { art: 'vorrat'; refType: BoardRefType; refId: string }
  | null;

/** Wohin losgelassen würde: Abschnitt und Position darin (Länge = ganz hinten). */
type Ziel = { sektion: string; index: number } | null;

/** Schlüssel des Abschnitts für Karten ohne Sparte. */
const OHNE = '__ohne__';

type Sortierung = 'eigen' | 'faellig';

/** Wann ist die Karte fällig? Frist, sonst Wiedervorlage. */
function faelligkeit(item: BoardItem): string | null {
  return item.dueDate ?? item.followUpAt ?? null;
}

function leseSortierung(userId: string | undefined): Sortierung {
  try {
    return localStorage.getItem(`pinnwand-sortierung:${userId ?? ''}`) === 'faellig' ? 'faellig' : 'eigen';
  } catch {
    return 'eigen';
  }
}

interface Sektion {
  key: string;
  sparte: BoardSparte | null;
  items: BoardItem[];
}

export default function Pinnwand() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ansicht = searchParams.get('ansicht') === 'team' ? 'team' : 'meine';
  const { data: allItems = [], isLoading } = useBoardPins();
  const { data: supplyColumns = [], isLoading: supplyLoading } = useBoardSupply();
  const { data: sparten = [] } = useBoardSparten();

  const [supplyKey, setSupplyKey] = useState('frist');
  const [noteOpen, setNoteOpen] = useState(false);
  /** In welche Sparte eine neu geschriebene Aufgabe kommt (null = ohne). */
  const [noteSparte, setNoteSparte] = useState<string | null>(null);
  const [spartenOpen, setSpartenOpen] = useState(false);
  const [waitingItem, setWaitingItem] = useState<BoardItem | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const [sortierung, setSortierung] = useState<Sortierung>(() => leseSortierung(user?.id));
  useEffect(() => setSortierung(leseSortierung(user?.id)), [user?.id]);
  const wechsleSortierung = (neu: Sortierung) => {
    setSortierung(neu);
    try {
      localStorage.setItem(`pinnwand-sortierung:${user?.id ?? ''}`, neu);
    } catch {
      /* Ohne Speicher gilt die Wahl nur bis zum Neuladen. */
    }
  };
  const nachFaelligkeit = sortierung === 'faellig';

  const [zug, setZug] = useState<Zug>(null);
  const [ziel, setZiel] = useState<Ziel>(null);

  const pinToWall = usePinToWall();
  const unpin = useUnpin();
  const reorder = useReorderPin();
  const complete = useCompleteBoardItem();
  const setWaiting = useSetWaiting();
  const deleteSupplyTodo = useDeleteSupplyTodo();
  const restore = useRestoreBoardItem();
  const setPinSparte = useSetPinSparte();
  const setRefSparte = useSetRefSparte();

  const mine = useMemo(
    () => allItems.filter(i => i.pin?.user_id === user?.id),
    [allItems, user?.id]
  );

  const wall = useMemo(
    () =>
      mine
        .filter(i => i.pin?.column_key === 'wall')
        .sort((a, b) => (a.pin!.sort_order ?? 0) - (b.pin!.sort_order ?? 0)),
    [mine]
  );

  const waiting = useMemo(() => mine.filter(i => i.pin?.column_key === 'waiting'), [mine]);

  /** Abgehakt — bleibt nachvollziehbar und lässt sich zurückholen. */
  const erledigt = useMemo(() => mine.filter(i => i.pin?.column_key === 'done'), [mine]);

  /**
   * Die Wand in Abschnitten: je Sparte einer, dahinter „Ohne Sparte".
   * Ohne eigene Sparten gibt es nur einen Abschnitt ohne Überschrift.
   * Innerhalb eines Abschnitts: eigene Reihenfolge oder nach Fälligkeit.
   */
  const sektionen = useMemo((): Sektion[] => {
    const bekannt = new Set(sparten.map(s => s.id));
    const keyVon = (i: BoardItem) => {
      const id = sparteIdVon(i.pin);
      return id && bekannt.has(id) ? id : OHNE;
    };

    const ordne = (liste: BoardItem[]) => {
      if (!nachFaelligkeit) return liste;
      return [...liste].sort((a, b) => {
        const fa = faelligkeit(a);
        const fb = faelligkeit(b);
        if (fa && fb && fa !== fb) return fa < fb ? -1 : 1;
        if (fa && !fb) return -1;
        if (!fa && fb) return 1;
        return (a.pin!.sort_order ?? 0) - (b.pin!.sort_order ?? 0);
      });
    };

    const ohne = ordne(wall.filter(i => keyVon(i) === OHNE));
    if (sparten.length === 0) return [{ key: OHNE, sparte: null, items: ohne }];
    return [
      ...sparten.map(sp => ({ key: sp.id, sparte: sp, items: ordne(wall.filter(i => keyVon(i) === sp.id)) })),
      { key: OHNE, sparte: null, items: ohne },
    ];
  }, [wall, sparten, nachFaelligkeit]);

  const mitSparten = sparten.length > 0;
  const sparteVon = (key: string) => (key === OHNE ? null : key);

  /**
   * Eine Karte innerhalb ihres Abschnitts an Position `to` schieben (Zählung in
   * der Liste ohne die Karte selbst). Geschrieben wird nur eine Zeile: der
   * Mittelwert der Nachbarn.
   */
  const verschiebe = (sektion: Sektion, von: number, to: number) => {
    const item = sektion.items[von];
    if (!item?.pin || to === von) return;
    const ohne = sektion.items.filter((_, i) => i !== von);
    const before = to > 0 ? ohne[to - 1]?.pin?.sort_order ?? null : null;
    const after = to < ohne.length ? ohne[to]?.pin?.sort_order ?? null : null;
    reorder.mutate({ pinId: item.pin.id, before, after });
  };

  /** Karte per Menü in eine andere Sparte legen — dort ganz nach vorne. */
  const setzeSparte = (item: BoardItem, sparteId: string | null) => {
    if (!item.pin) return;
    const zielSektion = sektionen.find(s => s.key === (sparteId ?? OHNE));
    const erste = zielSektion?.items.find(i => i.pin?.id !== item.pin!.id);
    setPinSparte.mutate({
      pinId: item.pin.id,
      sparteId,
      sortOrder: nachFaelligkeit || !erste?.pin ? undefined : erste.pin.sort_order - 1,
    });
  };

  const zugEnde = () => {
    setZug(null);
    setZiel(null);
  };

  const ablegen = () => {
    if (!zug || ziel === null) return zugEnde();
    const zielSparte = sparteVon(ziel.sektion);

    if (zug.art === 'vorrat') {
      // Aus dem Vorrat kommt sie oben an — wie beim „+"-Knopf.
      const { refType, refId } = zug;
      pinToWall.mutate(
        { refType, refId },
        { onSuccess: () => { if (zielSparte) setRefSparte.mutate({ refId, sparteId: zielSparte }); } },
      );
      return zugEnde();
    }

    const sektion = sektionen.find(s => s.key === ziel.sektion);
    if (!sektion) return zugEnde();
    const gleicherAbschnitt = zug.sektion === ziel.sektion;

    if (nachFaelligkeit) {
      // Die Reihenfolge kommt vom Datum — Ziehen wechselt nur die Sparte.
      if (!gleicherAbschnitt) setPinSparte.mutate({ pinId: zug.pinId, sparteId: zielSparte });
      return zugEnde();
    }

    // `ziel.index` zählt im eigenen Abschnitt mit der gezogenen Karte.
    const to = gleicherAbschnitt && ziel.index > zug.index ? ziel.index - 1 : ziel.index;
    if (gleicherAbschnitt && to === zug.index) return zugEnde();
    const ohne = sektion.items.filter(i => i.pin?.id !== zug.pinId);
    const before = to > 0 ? ohne[to - 1]?.pin?.sort_order ?? null : null;
    const after = to < ohne.length ? ohne[to]?.pin?.sort_order ?? null : null;
    if (gleicherAbschnitt) {
      reorder.mutate({ pinId: zug.pinId, before, after });
    } else {
      // Neue Sparte und Platz darin in einem Schritt.
      let sortOrder: number;
      if (before === null && after === null) sortOrder = 0;
      else if (before === null) sortOrder = (after as number) - 1;
      else if (after === null) sortOrder = before + 1;
      else sortOrder = (before + after) / 2;
      setPinSparte.mutate({ pinId: zug.pinId, sparteId: zielSparte, sortOrder });
    }
    zugEnde();
  };

  /** Beim Überfahren einer Karte: vor oder hinter ihr einfügen? */
  const ueberKarte = (e: React.DragEvent, sektion: string, index: number) => {
    if (!zug) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = zug.art === 'wand' ? 'move' : 'copy';
    const box = e.currentTarget.getBoundingClientRect();
    setZiel({ sektion, index: index + (e.clientX > box.left + box.width / 2 ? 1 : 0) });
  };

  const schreibeIn = (sparteId: string | null) => {
    setNoteSparte(sparteId);
    setNoteOpen(true);
  };

  const tooMany = wall.length >= 12;

  const umschalter = (
    <div className="inline-flex rounded-lg bg-muted p-1">
      <button
        type="button"
        onClick={() => setSearchParams({})}
        className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
          ansicht === 'meine'
            ? 'bg-background font-medium text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Meine Wand
      </button>
      <button
        type="button"
        onClick={() => setSearchParams({ ansicht: 'team' })}
        className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
          ansicht === 'team'
            ? 'bg-background font-medium text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Team
      </button>
    </div>
  );

  const sortierSchalter = (
    <div className="inline-flex items-center rounded-lg border border-border p-0.5 text-[12.5px]" role="group" aria-label="Sortierung">
      <button
        type="button"
        onClick={() => wechsleSortierung('eigen')}
        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
          !nachFaelligkeit ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Eigene Reihenfolge — per Ziehen sortieren"
      >
        <GripVertical className="h-3.5 w-3.5" /> Eigene Reihenfolge
      </button>
      <button
        type="button"
        onClick={() => wechsleSortierung('faellig')}
        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
          nachFaelligkeit ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Dringendste zuerst, Aufgaben ohne Datum am Ende"
      >
        <ArrowDownWideNarrow className="h-3.5 w-3.5" /> Nach Fälligkeit
      </button>
    </div>
  );

  if (ansicht === 'team') {
    return (
      <div>
        <div className="mb-4">{umschalter}</div>
        <BoardTeam />
      </div>
    );
  }

  /** Ein Abschnitt der Wand: Überschrift (bei Sparten) und das Kartenraster. */
  const renderSektion = (sektion: Sektion) => {
    const { key, items } = sektion;
    const leer = items.length === 0;
    const endeAktiv = zug && ziel?.sektion === key && ziel.index === items.length;

    return (
      <div key={key} className={mitSparten ? 'mb-6' : ''}>
        {mitSparten && (
          <div className="mb-2.5 flex items-center gap-2 border-b border-border pb-1.5">
            {sektion.sparte ? (
              <span className={`h-2.5 w-2.5 rounded-full ${sparteDot(sektion.sparte.color)}`} />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full border border-muted-foreground/50" />
            )}
            <h2 className="text-[13.5px] font-semibold text-foreground">
              {sektion.sparte ? sektion.sparte.name : 'Ohne Sparte'}
            </h2>
            <span className="text-[12px] text-muted-foreground">{items.length}</span>
            <button
              type="button"
              onClick={() => schreibeIn(sparteVon(key))}
              className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={`Aufgabe in „${sektion.sparte ? sektion.sparte.name : 'Ohne Sparte'}" schreiben`}
              aria-label="Aufgabe in diesem Abschnitt schreiben"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3" onDragEnd={zugEnde}>
          {items.map((item, index) => {
            const gezogen = zug?.art === 'wand' && zug.pinId === item.pin!.id;
            const markiertVor = zug && ziel?.sektion === key && ziel.index === index;
            const markiertNach =
              zug && ziel?.sektion === key && ziel.index === index + 1 && index === items.length - 1;
            return (
              <div
                key={item.pin!.id}
                draggable
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', item.pin!.id);
                  setZug({ art: 'wand', sektion: key, index, pinId: item.pin!.id });
                }}
                onDragEnd={zugEnde}
                onDragOver={e => ueberKarte(e, key, index)}
                onDrop={e => {
                  e.preventDefault();
                  ablegen();
                }}
                className={`cursor-grab rounded-[10px] transition-shadow active:cursor-grabbing ${
                  gezogen ? 'opacity-40' : ''
                } ${
                  !nachFaelligkeit && markiertVor
                    ? 'shadow-[inset_3px_0_0_0_hsl(var(--primary))]'
                    : !nachFaelligkeit && markiertNach
                      ? 'shadow-[inset_-3px_0_0_0_hsl(var(--primary))]'
                      : ''
                }`}
              >
                <BoardCard
                  item={item}
                  dragging={gezogen}
                  onOpen={i => {
                    if (i.refType === 'todo' || i.refType === 'maintenance') {
                      navigate(`/pinnwand/${i.refId}`);
                    }
                  }}
                  onComplete={i => complete.mutate(i)}
                  onRemove={i => i.pin && unpin.mutate(i.pin.id)}
                  onWaiting={i => setWaitingItem(i)}
                  onMove={
                    nachFaelligkeit
                      ? undefined
                      : richtung => verschiebe(sektion, index, richtung === 'vor' ? index - 1 : index + 1)
                  }
                  kannVor={index > 0}
                  kannZurueck={index < items.length - 1}
                  sparten={sparten}
                  onSetSparte={sparteId => setzeSparte(item, sparteId)}
                  onSpartenVerwalten={() => setSpartenOpen(true)}
                />
              </div>
            );
          })}

          {/* Ablagefläche am Ende des Abschnitts — und der Hinweis, wenn er leer ist. */}
          <div
            onDragOver={e => {
              if (!zug) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = zug.art === 'wand' ? 'move' : 'copy';
              setZiel({ sektion: key, index: items.length });
            }}
            onDrop={e => {
              e.preventDefault();
              ablegen();
            }}
            className={`flex items-center justify-center rounded-[10px] border border-dashed px-4 text-center text-[12.5px] transition-colors ${
              mitSparten && !leer && !zug ? 'min-h-[56px]' : 'min-h-[120px]'
            } ${
              endeAktiv
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-[#D8D2C6] text-muted-foreground'
            }`}
          >
            {zug
              ? 'Hier ablegen'
              : mitSparten && leer
                ? 'Noch leer — Karte hierher ziehen oder mit + schreiben'
                : 'Aus dem Vorrat rechts hierher ziehen'}
          </div>
        </div>
      </div>
    );
  };

  /** „Ohne Sparte" nur zeigen, wenn dort etwas liegt oder gerade gezogen wird. */
  const sichtbareSektionen = sektionen.filter(
    s => !mitSparten || s.key !== OHNE || s.items.length > 0 || !!zug
  );

  return (
    <div className="-m-3 flex min-h-[calc(100vh-8rem)] flex-col lg:-m-6 lg:flex-row">
      {/* Wand */}
      <section className="min-w-0 flex-1 p-4 lg:p-6">
        <div className="mb-3">{umschalter}</div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-semibold text-foreground">Meine Wand</h1>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {wall.length} {wall.length === 1 ? 'Aufgabe · bleibt' : 'Aufgaben · bleiben'} hängen, bis du sie abnimmst
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSpartenOpen(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" /> Sparten
            </Button>
            <Button
              variant="outline"
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={() => schreibeIn(null)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Aufgabe schreiben
            </Button>
          </div>
        </div>

        <div className="mb-4">{sortierSchalter}</div>

        {tooMany && (
          <div className="mb-4 rounded-lg border border-[#F3CBA0] bg-[#FFF7ED] px-3.5 py-2.5 text-[12.5px] text-[#8a5417]">
            {wall.length} Aufgaben an der Wand. Das ist keine Pinnwand mehr — vielleicht kann etwas zurück in den Vorrat.
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-[130px]" />
            <Skeleton className="h-[130px]" />
            <Skeleton className="h-[130px]" />
          </div>
        ) : (
          sichtbareSektionen.map(renderSektion)
        )}

        {waiting.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold text-foreground">Wartet auf</span>
              {waiting.map(item => {
                const days = daysSince(item.pin?.pinned_at ?? null);
                return (
                  <button
                    key={item.pin!.id}
                    type="button"
                    onClick={() => setWaitingItem(item)}
                    className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="font-medium">{item.pin?.waiting_for || item.title}</span>
                    {days !== null && (
                      <span className="text-muted-foreground"> · seit {days} {days === 1 ? 'Tag' : 'Tagen'}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Dezent ganz unten: das Archiv der abgehakten Aufgaben */}
        {!isLoading && erledigt.length > 0 && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setDoneOpen(true)}
              className="text-[12.5px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Erledigte Aufgaben ansehen ({erledigt.length})
            </button>
          </div>
        )}
      </section>

      <BoardSupply
        columns={supplyColumns}
        activeKey={supplyKey}
        onSelectColumn={setSupplyKey}
        onPin={item => pinToWall.mutate({ refType: item.refType, refId: item.refId })}
        onDelete={item => deleteSupplyTodo.mutate({ todoId: item.refId, titel: item.title })}
        isLoading={supplyLoading}
        onZiehStart={item => setZug({ art: 'vorrat', refType: item.refType, refId: item.refId })}
        onZiehEnde={zugEnde}
      />

      <TodoDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        mode="create"
        onCreated={todoId => {
          // Hängt die neue Aufgabe an der eigenen Wand, kommt sie gleich in die Sparte.
          if (noteSparte) setRefSparte.mutate({ refId: todoId, sparteId: noteSparte });
        }}
        /* Aufgehaengt wird im Dialog selbst — dort steht, an welche Wand. */
      />
      <SpartenDialog open={spartenOpen} onOpenChange={setSpartenOpen} />
      <DoneDialog
        open={doneOpen}
        onOpenChange={setDoneOpen}
        items={erledigt}
        restoringId={restore.isPending ? restore.variables?.pin?.id ?? null : null}
        onRestore={item => restore.mutate(item)}
      />
      <WaitingDialog
        item={waitingItem}
        onOpenChange={open => !open && setWaitingItem(null)}
        onConfirm={waitingFor => {
          if (waitingItem?.pin) {
            setWaiting.mutate({ pinId: waitingItem.pin.id, waitingFor });
          }
          setWaitingItem(null);
        }}
      />
    </div>
  );
}
