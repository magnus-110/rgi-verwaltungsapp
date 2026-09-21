import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  BoardItem,
  daysSince,
  useBoardPins,
  useBoardSupply,
  useCompleteBoardItem,
  usePinToWall,
  useReorderPin,
  useSetWaiting,
  useUnpin,
} from '@/hooks/useBoardPins';
import { BoardCard } from '@/components/board/BoardCard';
import { BoardSupply } from '@/components/board/BoardSupply';
import { TodoDialog } from '@/components/todos/TodoDialog';
import { WaitingDialog } from '@/components/board/WaitingDialog';

/**
 * Die Pinnwand.
 *
 * Dauerhaft, nicht tagesbezogen: kein Reset über Nacht. Zettel bleiben hängen,
 * bis jemand sie abnimmt. Was hier liegt, hat ein Mensch hierher gezogen.
 */
export default function Pinnwand() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: allItems = [], isLoading } = useBoardPins();
  const { data: supplyColumns = [], isLoading: supplyLoading } = useBoardSupply();

  const [supplyKey, setSupplyKey] = useState('frist');
  const [noteOpen, setNoteOpen] = useState(false);
  const [waitingItem, setWaitingItem] = useState<BoardItem | null>(null);

  const pinToWall = usePinToWall();
  const unpin = useUnpin();
  const reorder = useReorderPin();
  const complete = useCompleteBoardItem();
  const setWaiting = useSetWaiting();

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

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;

    const moved = wall[from];
    if (!moved?.pin) return;

    // Nachbarn in der Zielreihenfolge bestimmen, die gezogene Karte ausgenommen.
    const without = wall.filter((_, idx) => idx !== from);
    const before = to > 0 ? without[to - 1]?.pin?.sort_order ?? null : null;
    const after = to < without.length ? without[to]?.pin?.sort_order ?? null : null;

    reorder.mutate({ pinId: moved.pin.id, before, after });
  };

  const tooMany = wall.length >= 12;

  return (
    <div className="-m-3 flex min-h-[calc(100vh-8rem)] flex-col lg:-m-6 lg:flex-row">
      {/* Wand */}
      <section className="min-w-0 flex-1 p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-semibold text-foreground">Meine Wand</h1>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {wall.length} {wall.length === 1 ? 'Zettel' : 'Zettel'} · bleiben hängen, bis du sie abnimmst
            </p>
          </div>
          <Button
            variant="outline"
            className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={() => setNoteOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Zettel schreiben
          </Button>
        </div>

        {tooMany && (
          <div className="mb-4 rounded-lg border border-[#F3CBA0] bg-[#FFF7ED] px-3.5 py-2.5 text-[12.5px] text-[#8a5417]">
            {wall.length} Zettel an der Wand. Das ist keine Pinnwand mehr — vielleicht kann etwas zurück in den Vorrat.
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-[130px]" />
            <Skeleton className="h-[130px]" />
            <Skeleton className="h-[130px]" />
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="wall" direction="horizontal">
              {provided => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3"
                >
                  {wall.map((item, index) => (
                    <Draggable key={item.pin!.id} draggableId={item.pin!.id} index={index}>
                      {(dragProvided, snapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                        >
                          <BoardCard
                            item={item}
                            dragging={snapshot.isDragging}
                            onOpen={i => {
                              if (i.refType === 'todo' || i.refType === 'maintenance') {
                                navigate(`/pinnwand/${i.refId}`);
                              }
                            }}
                            onComplete={i => complete.mutate(i)}
                            onRemove={i => i.pin && unpin.mutate(i.pin.id)}
                            onWaiting={i => setWaitingItem(i)}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}

                  <div className="flex min-h-[120px] items-center justify-center rounded-[10px] border border-dashed border-[#D8D2C6] px-4 text-center text-[12.5px] text-muted-foreground">
                    Aus dem Vorrat rechts hierher holen
                  </div>
                </div>
              )}
            </Droppable>
          </DragDropContext>
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
      </section>

      <BoardSupply
        columns={supplyColumns}
        activeKey={supplyKey}
        onSelectColumn={setSupplyKey}
        onPin={item => pinToWall.mutate({ refType: item.refType, refId: item.refId })}
        isLoading={supplyLoading}
      />

      <TodoDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        mode="create"
        onCreated={todoId => pinToWall.mutate({ refType: 'todo', refId: todoId })}
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
