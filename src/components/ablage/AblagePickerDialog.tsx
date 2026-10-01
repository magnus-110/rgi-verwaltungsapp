import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatGroesse, relativeZeit, useAblage } from '@/hooks/useAblage';
import { ABLAGE_BUCKET } from '@/integrations/supabase/ablage';
import type { DmsPickerItem } from '@/components/meetings/DmsFilePickerDialog';

/**
 * „Aus Ablage anhängen" im E-Mail-Fenster: Dateien aus der Büro-Ablage
 * auswählen und an die Mail hängen. Die Datei bleibt dabei in der Ablage.
 */
export function AblagePickerDialog({
  open,
  onOpenChange,
  onSelectItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectItems: (items: DmsPickerItem[]) => void;
}) {
  const { items } = useAblage();
  const dateien = items.filter(i => i.kind === 'file' && i.file_path);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setAuswahl(new Set());
  }, [open]);

  const toggle = (id: string) =>
    setAuswahl(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const uebernehmen = () => {
    onSelectItems(
      dateien
        .filter(i => auswahl.has(i.id))
        .map(i => ({
          path: i.file_path!,
          name: i.file_name || 'Datei',
          mimeType: i.mime_type,
          size: i.file_size,
          bucket: ABLAGE_BUCKET,
        })),
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aus der Ablage anhängen</DialogTitle>
        </DialogHeader>
        {dateien.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-[13px] text-muted-foreground">
            <Inbox className="h-7 w-7 opacity-50" />
            In der Ablage liegen gerade keine Dateien.
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-2">
            <div className="space-y-1">
              {dateien.map(i => (
                <label
                  key={i.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted"
                >
                  <Checkbox checked={auswahl.has(i.id)} onCheckedChange={() => toggle(i.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{i.file_name}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {i.vonMir ? 'von mir' : `von ${i.fromName}`} · {relativeZeit(i.created_at)}
                      {i.file_size ? ` · ${formatGroesse(i.file_size)}` : ''}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={uebernehmen} disabled={auswahl.size === 0}>
            {auswahl.size > 1 ? `${auswahl.size} Dateien anhängen` : 'Anhängen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
