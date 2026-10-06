import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
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
  | { art: 'wand'; index: number; pinId: string }
  | { art: 'vorrat'; refType: BoardRefType; refId: string }
  | null;

export default function Pinnwand() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ansicht = searchParams.get('ansicht') === 'team' ? 'team' : 'meine';
  const { data: allItems = [], isLoading } = useBoardPins();
  const { data: supplyColumns = [], isLoading: supplyLoading } = useBoardSupply();

  const [supplyKey, setSupplyKey] = useState('frist');
  const [noteOpen, setNoteOpen] = useState(false);
  const [waitingItem, setWaitingItem] = useState<BoardItem | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const [zug, setZug] = useState<Zug>(null);
  /** Vor welcher Karte würde losgelassen? wall.length = ganz hinten. */
  const [ziel, setZiel] = useState<number | null>(null);

  const pinToWall = usePinToWall();
  const unpin = useUnpin();
  const reorder = useReorderPin();
  const complete = useCompleteBoardItem();
  const setWaiting = useSetWaiting();
  const deleteSupplyTodo = useDeleteSupplyTodo();
  const restore = useRestoreBoardItem();

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
   * Eine Karte an Position `to` schieben (Zählung in der Liste ohne die Karte
   * selbst). Geschrieben wird nur eine Zeile: der Mittelwert der Nachbarn.
   */
  const verschiebe = (von: number, to: number) => {
    const item = wall[von];
    if (!item?.pin || to === von) return;
    const ohne = wall.filter((_, i) => i !== von);
    const before = to > 0 ? ohne[to - 1]?.pin?.sort_order ?? null : null;
    const after = to < ohne.length ? ohne[to]?.pin?.sort_order ?? null : null;
    reorder.mutate({ pinId: item.pin.id, before, after });
  };

  const zugEnde = () => {
    setZug(null);
    setZiel(null);
  };

  const ablegen = () => {
    if (!zug || ziel === null) return zugEnde();

    if (zug.art === 'vorrat') {
      // Aus dem Vorrat kommt sie oben an — wie beim „+"-Knopf.
      pinToWall.mutate({ refType: zug.refType, refId: zug.refId });
    } else {
      // `ziel` zählt mit der gezogenen Karte, die Zielliste ist ohne sie.
      const to = ziel > zug.index ? ziel - 1 : ziel;
      verschiebe(zug.index, to);
    }
    zugEnde();
  };

  /** Beim Überfahren einer Karte: vor oder hinter ihr einfügen? */
  const ueberKarte = (e: React.DragEvent, index: number) => {
    if (!zug) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = zug.art === 'wand' ? 'move' : 'copy';
    const box = e.currentTarget.getBoundingClientRect();
    setZiel(index + (e.clientX > box.left + box.width / 2 ? 1 : 0));
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

  if (ansicht === 'team') {
    return (
      <div>
        <div className="mb-4">{umschalter}</div>
        <BoardTeam />
      </div>
    );
  }

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
          <Button
            variant="outline"
            className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={() => setNoteOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Aufgabe schreiben
          </Button>
        </div>

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
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3" onDragEnd={zugEnde}>
            {wall.map((item, index) => {
              const gezogen = zug?.art === 'wand' && zug.index === index;
              return (
                <div
                  key={item.pin!.id}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', item.pin!.id);
                    setZug({ art: 'wand', index, pinId: item.pin!.id });
                  }}
                  onDragEnd={zugEnde}
                  onDragOver={e => ueberKarte(e, index)}
                  onDrop={e => {
                    e.preventDefault();
                    ablegen();
                  }}
                  className={`cursor-grab rounded-[10px] transition-shadow active:cursor-grabbing ${
                    gezogen ? 'opacity-40' : ''
                  } ${
                    zug && ziel === index
                      ? 'shadow-[inset_3px_0_0_0_hsl(var(--primary))]'
                      : zug && ziel === index + 1 && index === wall.length - 1
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
                    onMove={richtung => verschiebe(index, richtung === 'vor' ? index - 1 : index + 1)}
                    kannVor={index > 0}
                    kannZurueck={index < wall.length - 1}
                  />
                </div>
              );
            })}

            {/* Ablagefläche am Ende — und der Hinweis, wenn die Wand leer ist. */}
            <div
              onDragOver={e => {
                if (!zug) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = zug.art === 'wand' ? 'move' : 'copy';
                setZiel(wall.length);
              }}
              onDrop={e => {
                e.preventDefault();
                ablegen();
              }}
              className={`flex min-h-[120px] items-center justify-center rounded-[10px] border border-dashed px-4 text-center text-[12.5px] transition-colors ${
                zug && ziel === wall.length
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-[#D8D2C6] text-muted-foreground'
              }`}
            >
              {zug ? 'Hier ablegen' : 'Aus dem Vorrat rechts hierher ziehen'}
            </div>
          </div>
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
        /* Aufgehaengt wird im Dialog selbst — dort steht, an welche Wand. */
      />
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
