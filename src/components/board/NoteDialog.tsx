import { useState } from 'react';
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
import { useCreateNote } from '@/hooks/useBoardPins';

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "+ Zettel schreiben" — bewusst klein gehalten.
 * Ein Post-it hat einen Satz und meistens kein Datum; alles Weitere
 * lässt sich später in der Aufgabe selbst nachtragen.
 */
export function NoteDialog({ open, onOpenChange }: NoteDialogProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const createNote = useCreateNote();

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await createNote.mutateAsync({ title: trimmed, dueDate: dueDate || null });
    setTitle('');
    setDueDate('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[470px]">
        <DialogHeader>
          <DialogTitle>Zettel schreiben</DialogTitle>
          <DialogDescription>
            Der Zettel hängt sofort an deiner Wand und bleibt dort, bis du ihn abnimmst.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="note-title">Was ist zu tun?</Label>
            <Input
              id="note-title"
              value={title}
              autoFocus
              placeholder="Bettrich wegen Heizung nachfassen"
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && title.trim()) submit();
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note-due">Frist (optional)</Label>
            <Input
              id="note-due"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
            <p className="text-[12px] text-muted-foreground">
              Nur ausfüllen, wenn das Datum eine echte Konsequenz hat. Die meisten Zettel brauchen keins.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={!title.trim() || createNote.isPending}>
            Aufhängen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
