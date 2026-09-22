import { Plus, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BoardItem, SupplyColumn, formatDateDe } from '@/hooks/useBoardPins';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface BoardSupplyProps {
  columns: SupplyColumn[];
  activeKey: string;
  onSelectColumn: (key: string) => void;
  onPin: (item: BoardItem) => void;
  isLoading?: boolean;
}

/**
 * Der Vorrat. Er füllt sich von selbst — die Wand nicht.
 * Deshalb steht hier nur ein "+"-Knopf und kein Automatismus.
 */
export function BoardSupply({ columns, activeKey, onSelectColumn, onPin, isLoading }: BoardSupplyProps) {
  const active = columns.find(c => c.key === activeKey) || columns[0];

  return (
    <aside className="flex w-full flex-col border-t border-border bg-card p-4 lg:w-[368px] lg:shrink-0 lg:border-l lg:border-t-0 lg:p-5">
      <h2 className="text-[15px] font-semibold text-foreground">Vorrat</h2>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">Spalte wählen, Zettel rüberholen</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {columns.map(col => {
          const isActive = col.key === active?.key;
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => onSelectColumn(col.key)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {col.label} · {col.items.length}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {isLoading && (
          <>
            <Skeleton className="h-[62px] w-full" />
            <Skeleton className="h-[62px] w-full" />
            <Skeleton className="h-[62px] w-full" />
          </>
        )}

        {!isLoading && active && active.items.length === 0 && (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            In dieser Spalte liegt gerade nichts.
          </p>
        )}

        {!isLoading &&
          active?.items.map(item => (
            <div
              key={`${item.refType}:${item.refId}`}
              className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium leading-snug text-foreground">{item.title}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                  {[item.context, item.dueDate ? `fällig ${formatDateDe(item.dueDate)}` : null]
                    .filter(Boolean)
                    .join(' · ') || 'ohne Termin'}
                </div>
              </div>
              {item.linkTo ? (
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label={`"${item.title}" im Jahreszyklus öffnen`}
                >
                  <Link to={item.linkTo}>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  onClick={() => onPin(item)}
                  aria-label={`"${item.title}" auf meine Wand heften`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
      </div>

      <p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">
        Nichts erscheint hier von selbst auf der Wand. Der Vorrat füllt sich, die Wand nur durch dich.
      </p>
    </aside>
  );
}
