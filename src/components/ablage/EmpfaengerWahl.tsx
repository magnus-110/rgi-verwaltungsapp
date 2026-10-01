import { useState } from 'react';
import { Check, Users, UserRound, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { WallPerson } from '@/hooks/useBoardWalls';

/**
 * „Für alle" oder „Nur für …".
 *
 * Standard ist „Für alle" — ohne zusätzlichen Klick. Wer etwas nur für
 * bestimmte Kollegen hinlegen will, klickt „Nur für" und hakt Namen an.
 * Eine leere Auswahl bedeutet immer „für alle".
 */
export function EmpfaengerWahl({
  people,
  selfId,
  value,
  onChange,
  compact,
}: {
  people: WallPerson[];
  selfId: string | undefined;
  value: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const andere = people.filter(p => p.userId !== selfId);
  const fuerAlle = value.length === 0;
  const namen = andere.filter(p => value.includes(p.userId)).map(p => p.name.split(' ')[0]);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);

  return (
    <div className={cn('flex items-center gap-1.5', compact ? 'text-[12px]' : 'text-[13px]')}>
      <div className="inline-flex rounded-lg bg-muted p-0.5">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors',
            fuerAlle ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Users className="h-3.5 w-3.5" /> Für alle
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex max-w-[220px] items-center gap-1 rounded-md px-2.5 py-1 transition-colors',
                !fuerAlle ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{fuerAlle ? 'Nur für …' : `Nur für ${namen.join(', ')}`}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1.5">
            <div className="px-2 pb-1.5 pt-1 text-[12px] text-muted-foreground">
              Wer soll es sehen? (Du siehst es immer.)
            </div>
            {andere.length === 0 && (
              <div className="px-2 py-2 text-[12.5px] text-muted-foreground">Keine Kollegen gefunden.</div>
            )}
            {andere.map(p => (
              <label
                key={p.userId}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted"
              >
                <Checkbox checked={value.includes(p.userId)} onCheckedChange={() => toggle(p.userId)} />
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  {p.initials}
                </span>
                <span className="truncate">{p.name}</span>
              </label>
            ))}
            {!fuerAlle && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[12.5px] font-medium text-primary-foreground"
              >
                <Check className="h-3.5 w-3.5" /> Fertig
              </button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
