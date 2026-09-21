import { useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { BoardItem, useBoardPins, formatDateDe } from '@/hooks/useBoardPins';
import { useWallPeople } from '@/hooks/useBoardWalls';
import { useHandoverPin } from '@/hooks/useBoardHandover';
import { HandoverDialog, HandoverTarget } from '@/components/board/HandoverDialog';

/**
 * Die Team-Ansicht (Screen 2 des Entwurfs).
 *
 * Eine Wand pro Person, nebeneinander. Zuweisen heißt hier: den Zettel
 * auf die Wand des anderen ziehen. Kein Formular, kein Statusfeld.
 */
export function BoardTeam() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: allItems = [], isLoading } = useBoardPins();
  const { data: people = [], isLoading: peopleLoading } = useWallPeople();
  const handover = useHandoverPin();

  const [target, setTarget] = useState<HandoverTarget | null>(null);

  /** Zettel je Person, in ihrer Sortierung. */
  const byPerson = useMemo(() => {
    const map = new Map<string, BoardItem[]>();
    people.forEach(p => map.set(p.userId, []));
    allItems
      .filter(i => i.pin?.column_key === 'wall')
      .forEach(i => {
        const list = map.get(i.pin!.user_id);
        if (list) list.push(i);
      });
    map.forEach(list =>
      list.sort((a, b) => (a.pin!.sort_order ?? 0) - (b.pin!.sort_order ?? 0))
    );
    return map;
  }, [allItems, people]);

  const handleDragEnd = (result: DropResult) => {
    const ziel = result.destination?.droppableId;
    const quelle = result.source.droppableId;
    if (!ziel || ziel === quelle) return;

    const item = (byPerson.get(quelle) || [])[result.source.index];
    const person = people.find(p => p.userId === ziel);
    if (!item || !person) return;

    setTarget({ item, targetUserId: person.userId, targetName: person.name });
  };

  if (isLoading || peopleLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-[17px] font-semibold text-foreground">
          {people.length} {people.length === 1 ? 'Wand' : 'Wände'}
        </h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Zettel von einer Wand auf die andere ziehen — das ist das Zuweisen.
        </p>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {people.map(person => {
            const zettel = byPerson.get(person.userId) || [];
            const istIch = person.userId === user?.id;

            return (
              <Droppable droppableId={person.userId} key={person.userId}>
                {(provided, snapshot) => (
                  <section
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`rounded-[11px] border bg-card p-3.5 transition-colors ${
                      snapshot.isDraggingOver
                        ? 'border-2 border-primary'
                        : 'border-border'
                    }`}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#2B2B2B] text-[10px] font-semibold text-white">
                        {person.initials}
                      </span>
                      <span className="text-[14px] font-semibold text-foreground">
                        {person.name}
                        {istIch && <span className="ml-1 text-muted-foreground">(du)</span>}
                      </span>
                      <span className="ml-auto text-[12px] text-muted-foreground">
                        {zettel.length} {zettel.length === 1 ? 'Zettel' : 'Zettel'}
                      </span>
                    </div>

                    {snapshot.isDraggingOver && (
                      <div className="mb-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary bg-[#FFF7ED] py-2.5 text-[12.5px] text-[#8a5417]">
                        <Plus className="h-3.5 w-3.5" /> Hier ablegen
                      </div>
                    )}

                    <div className="space-y-2">
                      {zettel.length === 0 && !snapshot.isDraggingOver && (
                        <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                          Leere Wand.
                        </p>
                      )}

                      {zettel.map((item, index) => (
                        <Draggable key={item.pin!.id} draggableId={item.pin!.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={
                                dragSnapshot.isDragging
                                  ? 'rotate-[-2deg] shadow-[0_14px_28px_rgba(43,43,43,.22)]'
                                  : ''
                              }
                            >
                              <div className="rounded-lg border border-[#EBE4D6] bg-[#FFFDF7] px-3 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (item.refType === 'todo' || item.refType === 'maintenance') {
                                      navigate(`/pinnwand/${item.refId}`);
                                    }
                                  }}
                                  className="block text-left text-[13.5px] font-medium leading-snug text-foreground hover:underline"
                                >
                                  {item.title}
                                </button>
                                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                                  {item.progress && item.progress.total > 0
                                    ? `${item.progress.done} von ${item.progress.total} erledigt`
                                    : item.dueDate
                                      ? `bis ${formatDateDe(item.dueDate)}`
                                      : item.context || 'ohne Termin'}
                                  {item.alsoOn.length > 0 &&
                                    ` · auch bei ${item.alsoOn.map(o => o.name.split(' ')[0]).join(', ')}`}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </section>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      <HandoverDialog
        target={target}
        onCancel={() => setTarget(null)}
        onConfirm={(note, silent) => {
          if (target) {
            handover.mutate({
              item: target.item,
              targetUserId: target.targetUserId,
              targetName: target.targetName,
              note,
              silent,
            });
          }
          setTarget(null);
        }}
      />
    </>
  );
}
