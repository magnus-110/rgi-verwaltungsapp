import { useState } from 'react';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BEREICH_FARBEN,
  type NotizBereich,
  useBereichAktionen,
} from '@/hooks/useNotizbuch';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bereiche: NotizBereich[];
  /** Wie viele Notizen in jedem Bereich liegen — Löschen nur, wenn leer. */
  anzahl: Record<string, number>;
  /** Nach dem Anlegen, z. B. um den neuen Bereich gleich auszuwählen. */
  onAngelegt?: (b: NotizBereich) => void;
}

function Farbwahl({ wert, onWahl }: { wert: string; onWahl: (hex: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Farbe" className="flex flex-wrap gap-2">
      {BEREICH_FARBEN.map(f => {
        const gewaehlt = f.hex === wert;
        return (
          <button
            key={f.hex}
            type="button"
            role="radio"
            aria-checked={gewaehlt}
            aria-label={f.name}
            title={f.name}
            onClick={() => onWahl(f.hex)}
            className="flex h-8 w-8 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              background: f.hex,
              boxShadow: gewaehlt ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${f.hex}` : undefined,
            }}
          >
            {gewaehlt && <Check className="h-4 w-4 text-white" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bereiche anlegen, umbenennen und löschen. Bereiche gelten für alle
 * Gebäude; bei Gebäude-Notizen dienen sie als Thema.
 */
export function BereicheDialog({ open, onOpenChange, bereiche, anzahl, onAngelegt }: Props) {
  const { anlegen, aendern, loeschen } = useBereichAktionen();
  const [name, setName] = useState('');
  const [farbe, setFarbe] = useState(BEREICH_FARBEN[2].hex);
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [bName, setBName] = useState('');
  const [bFarbe, setBFarbe] = useState('');

  const neuAnlegen = () =>
    anlegen.mutate(
      { name, color: farbe },
      {
        onSuccess: b => {
          setName('');
          onAngelegt?.(b);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bereiche</DialogTitle>
          <DialogDescription>
            Bereiche gelten für alle Gebäude. Bei Gebäude-Notizen dienen sie als Thema
            (z. B. ETV, Buchhaltung, Technik).
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={e => {
            e.preventDefault();
            neuAnlegen();
          }}
        >
          <label htmlFor="neuer-bereich" className="text-[13px] font-semibold">
            Neuer Bereich
          </label>
          <Input
            id="neuer-bereich"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z. B. Versicherungen"
          />
          <Farbwahl wert={farbe} onWahl={setFarbe} />
          <Button type="submit" size="sm" disabled={!name.trim() || anlegen.isPending}>
            Anlegen
          </Button>
        </form>

        <div className="max-h-[300px] space-y-1 overflow-y-auto">
          {bereiche.length === 0 && (
            <p className="py-2 text-[13px] text-muted-foreground">Noch keine Bereiche.</p>
          )}
          {bereiche.map(b => {
            const n = anzahl[b.id] ?? 0;
            if (bearbeite === b.id) {
              return (
                <form
                  key={b.id}
                  className="space-y-2 rounded-lg bg-muted/50 p-2"
                  onSubmit={e => {
                    e.preventDefault();
                    aendern.mutate(
                      { id: b.id, name: bName, color: bFarbe },
                      { onSuccess: () => setBearbeite(null) },
                    );
                  }}
                >
                  <Input value={bName} onChange={e => setBName(e.target.value)} aria-label="Name des Bereichs" />
                  <Farbwahl wert={bFarbe} onWahl={setBFarbe} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={aendern.isPending}>Speichern</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setBearbeite(null)}>
                      Abbrechen
                    </Button>
                  </div>
                </form>
              );
            }
            return (
              <div key={b.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: b.color }} />
                <span className="flex-1 text-[13.5px]">{b.name}</span>
                <span className="text-[12px] text-muted-foreground">{n}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={`${b.name} bearbeiten`}
                  onClick={() => {
                    setBearbeite(b.id);
                    setBName(b.name);
                    setBFarbe(b.color);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={`${b.name} löschen`}
                  title={n > 0 ? 'Nur leere Bereiche lassen sich löschen' : 'Löschen'}
                  disabled={n > 0 || loeschen.isPending}
                  onClick={() => {
                    if (confirm(`Bereich „${b.name}“ löschen?`)) loeschen.mutate(b.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-muted-foreground">
          Ein Bereich lässt sich nur löschen, wenn keine Notiz mehr darin liegt.
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fertig
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
