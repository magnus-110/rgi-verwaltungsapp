import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SPARTEN_FARBEN,
  sparteDot,
  useBoardSparten,
  useCreateSparte,
  useDeleteSparte,
  useUpdateSparte,
  type BoardSparte,
} from '@/hooks/useBoardSparten';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Farbauswahl als Reihe kleiner Punkte. */
function FarbWahl({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SPARTEN_FARBEN.map(f => (
        <button
          key={f.key}
          type="button"
          title={f.label}
          aria-label={`Farbe ${f.label}`}
          onClick={() => onChange(f.key)}
          className={`h-5 w-5 rounded-full ${f.dot} transition-transform ${
            value === f.key ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:scale-110'
          }`}
        />
      ))}
    </div>
  );
}

function SparteZeile({
  sparte,
  kannHoch,
  kannRunter,
  onHoch,
  onRunter,
}: {
  sparte: BoardSparte;
  kannHoch: boolean;
  kannRunter: boolean;
  onHoch: () => void;
  onRunter: () => void;
}) {
  const update = useUpdateSparte();
  const loeschen = useDeleteSparte();
  const [name, setName] = useState(sparte.name);
  const [farbeOffen, setFarbeOffen] = useState(false);

  useEffect(() => setName(sparte.name), [sparte.name]);

  const speichereName = () => {
    const neu = name.trim();
    if (!neu) {
      setName(sparte.name);
      return;
    }
    if (neu !== sparte.name) update.mutate({ id: sparte.id, name: neu });
  };

  return (
    <div className="rounded-lg border border-border px-2.5 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFarbeOffen(v => !v)}
          className={`h-4 w-4 shrink-0 rounded-full ${sparteDot(sparte.color)}`}
          title="Farbe ändern"
          aria-label="Farbe ändern"
        />
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={speichereName}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setName(sparte.name);
          }}
          className="h-8 text-sm"
          aria-label="Name der Sparte"
        />
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={!kannHoch} onClick={onHoch} title="Nach oben">
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={!kannRunter} onClick={onRunter} title="Nach unten">
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          title="Sparte löschen"
          onClick={() => {
            if (window.confirm(`Sparte „${sparte.name}" löschen? Ihre Karten bleiben an der Wand und stehen dann unter „Ohne Sparte".`)) {
              loeschen.mutate(sparte.id);
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {farbeOffen && (
        <div className="mt-2 pl-6">
          <FarbWahl
            value={sparte.color}
            onChange={key => {
              update.mutate({ id: sparte.id, color: key });
              setFarbeOffen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Eigene Sparten anlegen, umbenennen, umfärben, umsortieren und löschen. */
export function SpartenDialog({ open, onOpenChange }: Props) {
  const { data: sparten = [] } = useBoardSparten();
  const anlegen = useCreateSparte();
  const update = useUpdateSparte();
  const [neuName, setNeuName] = useState('');
  const [neuFarbe, setNeuFarbe] = useState('orange');

  const tausche = (a: number, b: number) => {
    const x = sparten[a];
    const y = sparten[b];
    if (!x || !y) return;
    // Bei gleichen Werten (alte Daten) eindeutig machen.
    const sx = x.sort_order === y.sort_order ? a : x.sort_order;
    const sy = x.sort_order === y.sort_order ? b : y.sort_order;
    update.mutate({ id: x.id, sort_order: sy });
    update.mutate({ id: y.id, sort_order: sx });
  };

  const neueAnlegen = () => {
    const name = neuName.trim();
    if (!name) return;
    anlegen.mutate(
      { name, color: neuFarbe },
      { onSuccess: () => setNeuName('') },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meine Sparten</DialogTitle>
          <DialogDescription>
            Sparten teilen deine Wand in Abschnitte, z. B. „Offene Posten" oder „Nebenkosten".
            Sie gelten nur für deine eigene Wand.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {sparten.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Sparten angelegt.</p>
          )}
          {sparten.map((s, i) => (
            <SparteZeile
              key={s.id}
              sparte={s}
              kannHoch={i > 0}
              kannRunter={i < sparten.length - 1}
              onHoch={() => tausche(i, i - 1)}
              onRunter={() => tausche(i, i + 1)}
            />
          ))}
        </div>

        <div className="mt-2 space-y-2 rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">Neue Sparte</p>
          <div className="flex items-center gap-2">
            <Input
              value={neuName}
              onChange={e => setNeuName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') neueAnlegen();
              }}
              placeholder="z. B. Offene Posten"
              className="h-9 text-sm"
            />
            <Button onClick={neueAnlegen} disabled={!neuName.trim() || anlegen.isPending} className="h-9 shrink-0">
              <Plus className="mr-1 h-4 w-4" /> Anlegen
            </Button>
          </div>
          <FarbWahl value={neuFarbe} onChange={setNeuFarbe} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
