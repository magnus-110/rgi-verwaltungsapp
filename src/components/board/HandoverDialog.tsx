import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { BoardItem } from '@/hooks/useBoardPins';

export interface HandoverTarget {
  item: BoardItem;
  targetUserId: string;
  targetName: string;
}

interface HandoverDialogProps {
  target: HandoverTarget | null;
  onCancel: () => void;
  onConfirm: (note: string | null, silent: boolean) => void;
  /** Bei "auch aufhängen" bleibt die Aufgabe zusätzlich beim Absender. */
  modus?: 'uebergeben' | 'zusaetzlich';
}

/**
 * Der Übergabe-Dialog (Screen 2 des Entwurfs).
 *
 * Der Schalter "still hinlegen" ist der eigentliche Punkt: Manches muss
 * jemand sofort wissen, das meiste kann einfach dort liegen, bis der
 * andere von selbst hinschaut.
 */
export function HandoverDialog({ target, onCancel, onConfirm, modus = 'uebergeben' }: HandoverDialogProps) {
  const [note, setNote] = useState('');
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    if (target) {
      setNote('');
      setSilent(false);
    }
  }, [target]);

  const vorname = target?.targetName.split(' ')[0] ?? '';

  return (
    <Dialog open={!!target} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="sm:max-w-[470px]">
        <DialogHeader>
          <DialogTitle>
            {modus === 'zusaetzlich'
              ? `Auch bei ${vorname} aufhängen`
              : `An ${vorname} übergeben`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-[13px] text-muted-foreground">
            „{target?.item.title}"
            {modus === 'zusaetzlich'
              ? ' hängt danach an beiden Wänden. Abhaken sieht der andere sofort.'
              : ` liegt danach auf der Wand von ${vorname} und verschwindet von deiner.`}
          </p>

          <div className="space-y-2">
            <Label htmlFor="handover-note">Notiz dazu (optional)</Label>
            <Input
              id="handover-note"
              value={note}
              autoFocus
              placeholder="Preise mit dem Angebot von Juli vergleichen"
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onConfirm(note.trim() || null, silent);
              }}
            />
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <Switch id="handover-silent" checked={silent} onCheckedChange={setSilent} />
            <div>
              <Label htmlFor="handover-silent" className="cursor-pointer text-[13px] font-medium">
                Still hinlegen — keine Benachrichtigung
              </Label>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {vorname} findet die Aufgabe beim nächsten Blick auf die eigene Wand.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button onClick={() => onConfirm(note.trim() || null, silent)}>Hinlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
