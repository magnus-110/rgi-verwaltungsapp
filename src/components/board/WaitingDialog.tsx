import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BoardItem } from '@/hooks/useBoardPins';

interface WaitingDialogProps {
  item: BoardItem | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (waitingFor: string | null) => void;
}

/**
 * "Wartet auf …" — die Aufgabe verschwindet nicht, sie rutscht nur in die
 * Leiste unten. Sonst vergisst man, worauf man eigentlich wartet.
 */
export function WaitingDialog({ item, onOpenChange, onConfirm }: WaitingDialogProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    setText(item?.pin?.waiting_for || '');
  }, [item]);

  const isWaiting = item?.pin?.column_key === 'waiting';

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[470px]">
        <DialogHeader>
          <DialogTitle>Worauf wartest du?</DialogTitle>
          <DialogDescription>
            „{item?.title}" rutscht in die Leiste unten und zeigt dort, seit wann.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          <Label htmlFor="waiting-for">Wartet auf</Label>
          <Input
            id="waiting-for"
            value={text}
            autoFocus
            placeholder="Rückruf Gschwend"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && text.trim()) onConfirm(text.trim());
            }}
          />
        </div>

        <DialogFooter className="sm:justify-between">
          {isWaiting ? (
            <Button variant="outline" onClick={() => onConfirm(null)}>
              Zurück auf die Wand
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => onConfirm(text.trim() || null)} disabled={!text.trim()}>
              Übernehmen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
