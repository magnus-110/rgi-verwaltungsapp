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
import { CycleDefinition, useSaveCycleDefinition } from '@/hooks/useAnnualCycle';
import { toast } from '@/hooks/use-toast';

interface ZeitfensterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitionen: CycleDefinition[];
}

/**
 * Die 15 Zeitfenster bearbeiten.
 *
 * Aus dem Plan: Diese Werte sind ein fachlicher Vorschlag. Sie sind der
 * einzige Hebel, der aus über 600 offenen Zeilen eine brauchbare Liste
 * macht — deshalb gehören sie in die Hand des Verwalters, nicht in den Code.
 */
export function ZeitfensterDialog({ open, onOpenChange, definitionen }: ZeitfensterDialogProps) {
  const speichern = useSaveCycleDefinition();
  const [werte, setWerte] = useState<Record<string, { von: string; bis: string }>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, { von: string; bis: string }> = {};
    definitionen.forEach(d => {
      next[d.task_key] = {
        von: String(d.relevant_from_month),
        bis: d.relevant_to_month === null ? '' : String(d.relevant_to_month),
      };
    });
    setWerte(next);
  }, [open, definitionen]);

  const alleSpeichern = async () => {
    for (const d of definitionen) {
      const w = werte[d.task_key];
      if (!w) continue;
      const von = Number(w.von);
      const bis = w.bis.trim() === '' ? null : Number(w.bis);
      if (!Number.isFinite(von) || von < 0 || von > 24) {
        toast({
          title: 'Wert nicht übernommen',
          description: `„${d.label}": Von-Monat muss zwischen 0 und 24 liegen.`,
          variant: 'destructive',
        });
        return;
      }
      if (bis !== null && (!Number.isFinite(bis) || bis < von)) {
        toast({
          title: 'Wert nicht übernommen',
          description: `„${d.label}": Bis-Monat darf nicht vor dem Von-Monat liegen.`,
          variant: 'destructive',
        });
        return;
      }
      if (von === d.relevant_from_month && bis === d.relevant_to_month) continue;
      await speichern.mutateAsync({
        task_key: d.task_key,
        relevant_from_month: von,
        relevant_to_month: bis,
      });
    }
    toast({ title: 'Zeitfenster gespeichert' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Zeitfenster bearbeiten</DialogTitle>
          <DialogDescription>
            Je Pflicht: ab welchem Monat nach Ende des Wirtschaftsjahres sie ansteht, und bis wann.
            0 heißt „sofort nach Jahresende". Das Bis-Feld darf leer bleiben — dann endet das Fenster nicht.
          </DialogDescription>
        </DialogHeader>

        <div className="-mr-2 max-h-[52vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-[1fr_72px_72px] items-center gap-x-3 gap-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pflicht
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              ab Monat
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              bis Monat
            </span>

            {definitionen.map(d => (
              <div key={d.task_key} className="contents">
                <span className="text-[13px] text-foreground">{d.label}</span>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={werte[d.task_key]?.von ?? ''}
                  onChange={e =>
                    setWerte(w => ({
                      ...w,
                      [d.task_key]: { ...w[d.task_key], von: e.target.value },
                    }))
                  }
                  className="h-8 text-[13px]"
                  aria-label={`${d.label}: ab Monat`}
                />
                <Input
                  type="number"
                  min={0}
                  max={36}
                  placeholder="offen"
                  value={werte[d.task_key]?.bis ?? ''}
                  onChange={e =>
                    setWerte(w => ({
                      ...w,
                      [d.task_key]: { ...w[d.task_key], bis: e.target.value },
                    }))
                  }
                  className="h-8 text-[13px]"
                  aria-label={`${d.label}: bis Monat`}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={alleSpeichern} disabled={speichern.isPending}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
