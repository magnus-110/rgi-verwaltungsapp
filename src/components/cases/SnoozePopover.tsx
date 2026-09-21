import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateDe } from '@/hooks/useBoardPins';

interface SnoozePopoverProps {
  snoozeUntil: string | null;
  onSnooze: (bis: string | null) => void;
  /** Kompakt in der Liste, ausführlicher in der Akte. */
  variant?: 'knopf' | 'leiste';
}

function inTagen(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  return d.toISOString().slice(0, 10);
}

const OPTIONEN: { label: string; tage: number }[] = [
  { label: '1 Woche', tage: 7 },
  { label: '2 Wochen', tage: 14 },
  { label: '1 Monat', tage: 30 },
];

/**
 * „Ruht bis …" — der Vorgang verschwindet aus der Durchsicht und kommt
 * dann von selbst zurück. Nichts wird geschlossen, nichts geht verloren.
 */
export function SnoozePopover({ snoozeUntil, onSnooze, variant = 'knopf' }: SnoozePopoverProps) {
  const [open, setOpen] = useState(false);
  const [datum, setDatum] = useState('');

  const inhalt = (
    <div className="w-[260px] space-y-3 p-1">
      <div className="flex flex-wrap gap-1.5">
        {OPTIONEN.map(o => (
          <Button
            key={o.label}
            size="sm"
            variant="outline"
            className="h-8 text-[12.5px]"
            onClick={() => {
              onSnooze(inTagen(o.tage));
              setOpen(false);
            }}
          >
            {o.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          type="date"
          value={datum}
          onChange={e => setDatum(e.target.value)}
          className="h-8 text-[12.5px]"
        />
        <Button
          size="sm"
          className="h-8"
          disabled={!datum}
          onClick={() => {
            onSnooze(datum);
            setDatum('');
            setOpen(false);
          }}
        >
          OK
        </Button>
      </div>

      {snoozeUntil && (
        <div className="border-t border-border pt-2">
          <p className="mb-2 text-[12px] text-muted-foreground">
            Ruht bis {formatDateDe(snoozeUntil)}.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-full text-[12.5px]"
            onClick={() => {
              onSnooze(null);
              setOpen(false);
            }}
          >
            Jetzt wieder zeigen
          </Button>
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Verschwindet so lange aus der Durchsicht und kommt dann von selbst zurück.
      </p>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === 'leiste' ? (
          <Button variant="outline" size="sm">
            {snoozeUntil ? `Ruht bis ${formatDateDe(snoozeUntil)}` : 'Ruht bis …'}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 whitespace-nowrap text-[12.5px]">
            Ruht bis …
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        {inhalt}
      </PopoverContent>
    </Popover>
  );
}
