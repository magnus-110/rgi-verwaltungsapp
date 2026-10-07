import React from 'react';
import { ArrowLeft, ArrowRight, Check, MoreHorizontal, X, Clock, Tag, Settings2 } from 'lucide-react';
import {
  BoardItem,
  ORIGIN_DOT,
  ORIGIN_LABEL,
  daysSince,
  formatDateDe,
} from '@/hooks/useBoardPins';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sparteDot, sparteIdVon } from '@/hooks/useBoardSparten';
import { Button } from '@/components/ui/button';

interface BoardCardProps {
  item: BoardItem;
  onOpen?: (item: BoardItem) => void;
  onComplete?: (item: BoardItem) => void;
  onRemove?: (item: BoardItem) => void;
  onWaiting?: (item: BoardItem) => void;
  /** Kompakt = Team-Ansicht: nur Titel und Kontextzeile. */
  compact?: boolean;
  dragging?: boolean;
  /** Reihenfolge ohne Maus ändern — für Touch und Tastatur. */
  onMove?: (richtung: 'vor' | 'zurueck') => void;
  kannVor?: boolean;
  kannZurueck?: boolean;
  /** Eigene Sparten — gesetzt, wenn die Karte einer Sparte zugeordnet werden kann. */
  sparten?: { id: string; name: string; color: string }[];
  onSetSparte?: (sparteId: string | null) => void;
  onSpartenVerwalten?: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Der kleine Hinweis unten links auf der Aufgabe.
 *
 * Ein Termin ist die Ausnahme, nicht die Regel — die meisten Aufgaben haben
 * keinen. Deshalb sticht nur noch hervor, was wirklich überfällig ist; ein
 * Datum in der Zukunft steht ruhig daneben, wie der Kontext auch.
 */
function StatusChip({ item }: { item: BoardItem }) {
  const today = todayIso();

  if (item.dueDate) {
    const overdue = item.dueDate < today;
    if (overdue) {
      return (
        <span className="inline-block rounded bg-[#FBEAE5] px-2 py-[3px] text-[11px] font-semibold text-[#B4472B]">
          überfällig seit {formatDateDe(item.dueDate)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        bis {formatDateDe(item.dueDate)}
      </span>
    );
  }

  const liegtSeit = daysSince(item.pin?.pinned_at ?? null);
  if (liegtSeit !== null && liegtSeit >= 3) {
    return (
      <span className="inline-block rounded bg-[#FFF4E3] px-2 py-[3px] text-[11px] text-[#8a6417]">
        liegt seit {liegtSeit} {liegtSeit === 1 ? 'Tag' : 'Tagen'}
      </span>
    );
  }

  return null;
}

export function BoardCard({
  item, onOpen, onComplete, onRemove, onWaiting, compact, dragging,
  onMove, kannVor, kannZurueck, sparten, onSetSparte, onSpartenVerwalten,
}: BoardCardProps) {
  const aktuelleSparte = sparteIdVon(item.pin);
  if (compact) {
    return (
      <div className="rounded-lg border border-[#EBE4D6] bg-[#FFFDF7] px-3 py-2.5">
        <div className="text-[13.5px] font-medium leading-snug text-foreground">{item.title}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">
          {item.progress && item.progress.total > 0
            ? `${item.progress.done} von ${item.progress.total} erledigt`
            : item.dueDate
              ? `bis ${formatDateDe(item.dueDate)}`
              : item.context || 'ohne Termin'}
        </div>
      </div>
    );
  }

  return (
    <div
      // Die ganze Karte oeffnet die Aufgabe, nicht nur die Ueberschrift. Das Menue
      // und alles darin stoppt den Klick selbst.
      {...(onOpen
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: () => onOpen(item),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(item);
              }
            },
            'aria-label': `Aufgabe „${item.title}" öffnen`,
          }
        : {})}
      className={`group relative flex flex-col rounded-[10px] border border-[#EBE4D6] bg-[#FFFDF7] p-3.5 transition-shadow ${
        onOpen ? 'cursor-pointer hover:border-[#D9CEB6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary' : ''
      } ${
        dragging ? 'shadow-[0_14px_28px_rgba(43,43,43,.22)] rotate-[-2deg]' : 'shadow-[0_1px_2px_rgba(43,43,43,.06)]'
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`h-[7px] w-[7px] rounded-full ${ORIGIN_DOT[item.origin]}`} />
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          {ORIGIN_LABEL[item.origin]}
          {item.progress && item.progress.total > 0 ? ' · Checkliste' : ''}
        </span>

        <div
          className="ml-auto"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Aktionen für diese Aufgabe"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Ohne Maus — auf dem Handy und mit der Tastatur. */}
              {onMove && (
                <>
                  <DropdownMenuItem disabled={!kannVor} onClick={() => onMove('vor')}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Weiter nach vorne
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!kannZurueck} onClick={() => onMove('zurueck')}>
                    <ArrowRight className="mr-2 h-4 w-4" /> Weiter nach hinten
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {onSetSparte && sparten && (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Tag className="mr-2 h-4 w-4" /> Sparte
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52">
                      {sparten.map(sp => (
                        <DropdownMenuItem key={sp.id} onClick={() => onSetSparte(sp.id)}>
                          <span className={`mr-2 h-2.5 w-2.5 rounded-full ${sparteDot(sp.color)}`} />
                          <span className="flex-1 truncate">{sp.name}</span>
                          {aktuelleSparte === sp.id && <Check className="ml-2 h-3.5 w-3.5" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem onClick={() => onSetSparte(null)}>
                        <span className="mr-2 h-2.5 w-2.5 rounded-full border border-muted-foreground/50" />
                        <span className="flex-1">Ohne Sparte</span>
                        {aktuelleSparte === null && <Check className="ml-2 h-3.5 w-3.5" />}
                      </DropdownMenuItem>
                      {onSpartenVerwalten && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={onSpartenVerwalten}>
                            <Settings2 className="mr-2 h-4 w-4" /> Sparten verwalten …
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                </>
              )}
              {onComplete && (
                <DropdownMenuItem onClick={() => onComplete(item)}>
                  <Check className="mr-2 h-4 w-4" /> Erledigt
                </DropdownMenuItem>
              )}
              {onWaiting && (
                <DropdownMenuItem onClick={() => onWaiting(item)}>
                  <Clock className="mr-2 h-4 w-4" /> Wartet auf …
                </DropdownMenuItem>
              )}
              {onRemove && (
                <DropdownMenuItem onClick={() => onRemove(item)}>
                  <X className="mr-2 h-4 w-4" /> Von der Wand nehmen
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="text-[14.5px] font-semibold leading-snug text-foreground">{item.title}</div>

      {item.context && (
        <div className="mt-1 text-[12px] text-muted-foreground">{item.context}</div>
      )}

      {item.progress && item.progress.total > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[#EBE4D6]">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((item.progress.done / item.progress.total) * 100)}%` }}
            />
          </div>
          <span className="text-[11.5px] text-muted-foreground">
            {item.progress.done}/{item.progress.total}
          </span>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <StatusChip item={item} />
      </div>

      {item.alsoOn.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#2B2B2B] text-[9.5px] font-semibold text-white">
            {item.alsoOn[0].initials}
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            hängt auch bei {item.alsoOn.map(o => o.name.split(' ')[0]).join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
