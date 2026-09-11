import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Einträge, die immer oben stehen (z. B. „Alle …“, „Ohne …“) */
  fixedOptions: FilterOption[];
  options: FilterOption[];
  icon?: ReactNode;
  searchPlaceholder: string;
  emptyText: string;
  className?: string;
}

/** Wie viele Treffer höchstens angezeigt werden (hält lange Kontaktlisten flüssig). */
const MAX_VISIBLE = 100;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss");

/** Auswahlliste mit Suchfeld – für lange Listen wie Liegenschaften oder Kontakte. */
export const SearchableFilterSelect = ({
  value,
  onChange,
  fixedOptions,
  options,
  icon,
  searchPlaceholder,
  emptyText,
  className,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedLabel =
    [...fixedOptions, ...options].find((o) => o.value === value)?.label ?? fixedOptions[0]?.label ?? "";

  const filtered = useMemo(() => {
    const words = normalize(search).split(/\s+/).filter(Boolean);
    const list = words.length
      ? options.filter((o) => {
          const label = normalize(o.label);
          return words.every((w) => label.includes(w));
        })
      : options;
    return list.slice(0, MAX_VISIBLE);
  }, [options, search]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-8 justify-between px-2 text-xs font-normal min-w-0", className)}
        >
          <span className="flex min-w-0 items-center gap-1">
            {icon}
            <span className="truncate">{selectedLabel}</span>
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {!search.trim() && (
              <CommandGroup>
                {fixedOptions.map((o) => (
                  <CommandItem key={o.value} value={o.value} onSelect={() => choose(o.value)}>
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === o.value ? "opacity-100" : "opacity-0")} />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((o) => (
                  <CommandItem key={o.value} value={o.value} onSelect={() => choose(o.value)}>
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === o.value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
