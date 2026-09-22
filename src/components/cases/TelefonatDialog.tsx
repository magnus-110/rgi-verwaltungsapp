import { useState } from 'react';
import { Phone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface TelefonatDialogProps {
  onSpeichern: (eintrag: { mitWem: string; wann: string; worum: string; richtung: Richtung }) => void;
  isPending?: boolean;
}

export type Richtung = 'eingehend' | 'ausgehend';

/** Jetzt, als Wert für ein datetime-local-Feld (also ohne Zeitzone). */
function jetztLokal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Telefonat festhalten.
 *
 * Ein Anruf ist die häufigste Bewegung, die sonst nirgends landet: keine Mail,
 * keine Notiz — und der Vorgang sieht still aus, obwohl gerade gesprochen
 * wurde. Deshalb gehört er als eigener Eintrag in den Verlauf.
 */
export function TelefonatDialog({ onSpeichern, isPending }: TelefonatDialogProps) {
  const [offen, setOffen] = useState(false);
  const [mitWem, setMitWem] = useState('');
  const [wann, setWann] = useState(jetztLokal());
  const [worum, setWorum] = useState('');
  const [richtung, setRichtung] = useState<Richtung>('ausgehend');

  const zuruecksetzen = () => {
    setMitWem('');
    setWann(jetztLokal());
    setWorum('');
    setRichtung('ausgehend');
  };

  const speichern = () => {
    if (!mitWem.trim()) return;
    onSpeichern({ mitWem: mitWem.trim(), wann, worum: worum.trim(), richtung });
    zuruecksetzen();
    setOffen(false);
  };

  return (
    <Dialog
      open={offen}
      onOpenChange={o => {
        setOffen(o);
        if (o) setWann(jetztLokal());
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Phone className="h-3.5 w-3.5" /> Telefonat eintragen
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Telefonat eintragen</DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="flex gap-1.5">
            {([
              ['ausgehend', 'Ich habe angerufen'],
              ['eingehend', 'Ich wurde angerufen'],
            ] as [Richtung, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRichtung(key)}
                className={`flex-1 rounded-md px-3 py-2 text-[12.5px] transition-colors ${
                  richtung === key
                    ? 'bg-[#2B2B2B] text-white'
                    : 'border border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <Label htmlFor="telefonat-wer" className="text-[12.5px]">
              Mit wem?
            </Label>
            <Input
              id="telefonat-wer"
              value={mitWem}
              onChange={e => setMitWem(e.target.value)}
              placeholder="Name, Firma oder Nummer"
              className="mt-1 text-[13px]"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="telefonat-wann" className="text-[12.5px]">
              Wann?
            </Label>
            <Input
              id="telefonat-wann"
              type="datetime-local"
              value={wann}
              onChange={e => setWann(e.target.value)}
              className="mt-1 text-[13px]"
            />
          </div>

          <div>
            <Label htmlFor="telefonat-worum" className="text-[12.5px]">
              Worum ging es?
            </Label>
            <Textarea
              id="telefonat-worum"
              value={worum}
              onChange={e => setWorum(e.target.value)}
              rows={4}
              placeholder="Was besprochen wurde, was vereinbart ist, was als Nächstes ansteht."
              className="mt-1 text-[13px]"
            />
          </div>

          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Der Eintrag zählt als Bewegung — der Vorgang gilt danach nicht mehr als still.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOffen(false)}>
            Abbrechen
          </Button>
          <Button disabled={!mitWem.trim() || isPending} onClick={speichern}>
            Eintragen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
