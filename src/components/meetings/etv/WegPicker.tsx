import { useState } from "react";
import { Building2, Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { WegBuilding } from "./useEtvData";

interface Props {
  buildings: WegBuilding[];
  value: string; // "all" oder building id
  onChange: (id: string) => void;
  className?: string;
}

/** Liegenschaftsfilter mit Suche – gilt für alle Bereiche der Versammlungsseite. */
export const WegPicker = ({ buildings, value, onChange, className }: Props) => {
  const [open, setOpen] = useState(false);
  const selected = buildings.find((b) => b.id === value);

  return (
    <div className={cn("flex items-center", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-10 min-w-[240px] items-center gap-2.5 rounded-[10px] border bg-background px-3.5 text-sm transition-colors hover:bg-muted/50",
              selected && "border-primary/50 bg-primary/5",
            )}
          >
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-left">
              <span className="text-muted-foreground">Liegenschaft: </span>
              {selected ? selected.name : `Alle (${buildings.length})`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="end">
          <Command>
            <CommandInput placeholder="Liegenschaft suchen …" />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>Keine Liegenschaft gefunden.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__alle__" onSelect={() => { onChange("all"); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === "all" ? "opacity-100" : "opacity-0")} />
                  Alle Liegenschaften
                </CommandItem>
                {buildings.map((b) => (
                  <CommandItem key={b.id} value={`${b.name} ${b.address || ""} ${b.city || ""}`} onSelect={() => { onChange(b.id); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", value === b.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{b.name}</span>
                    {b.city && <span className="ml-auto pl-2 text-xs text-muted-foreground">{b.city}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <button
          type="button"
          aria-label="Filter zurücksetzen"
          onClick={() => onChange("all")}
          className="ml-1 flex h-10 w-10 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
