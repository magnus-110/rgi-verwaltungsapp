import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { BoardItem, ORIGIN_DOT, ORIGIN_LABEL, formatDateDe } from '@/hooks/useBoardPins';

interface DoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BoardItem[];
  onRestore: (item: BoardItem) => void;
  /** pin.id der Aufgabe, die gerade zurückgeholt wird. */
  restoringId?: string | null;
}

/**
 * Das Archiv der eigenen Wand: alles, was abgehakt wurde, neueste zuerst.
 * Von hier aus lässt sich eine Aufgabe zurück an die Wand holen.
 */
export function DoneDialog({ open, onOpenChange, items, onRestore, restoringId }: DoneDialogProps) {
  const [suche, setSuche] = useState('');

  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return [...items]
      .filter(i => !q || `${i.title} ${i.context ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => (b.pin?.done_at ?? '').localeCompare(a.pin?.done_at ?? ''));
  }, [items, suche]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Erledigte Aufgaben</DialogTitle>
          <DialogDescription>
            Alles, was du an deiner Wand abgehakt hast. Mit „Zurückholen“ hängt die Aufgabe wieder
            vorne an der Wand und ist wieder offen.
          </DialogDescription>
        </DialogHeader>

        {items.length > 6 && (
          <Input
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Suchen …"
            className="h-9"
          />
        )}

        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {liste.length === 0 ? (
            <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">
              {items.length === 0 ? 'Noch nichts erledigt.' : 'Nichts gefunden.'}
            </p>
          ) : (
            <ul>
              {liste.map(item => (
                <li
                  key={item.pin!.id}
                  className="flex items-center gap-3 border-t border-border/60 px-2 py-2.5 first:border-t-0"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ORIGIN_DOT[item.origin]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-foreground line-through decoration-muted-foreground/50">
                      {item.title}
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">
                      {[ORIGIN_LABEL[item.origin], item.context, item.pin?.done_at ? `erledigt am ${formatDateDe(item.pin.done_at)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestore(item)}
                    disabled={restoringId === item.pin!.id}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Zurückholen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
