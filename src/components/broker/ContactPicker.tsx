import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { db, fehler, kontaktLabel, type LeadContact } from "@/lib/makler";

type Row = LeadContact & { id: string; address_city: string | null };

function label(c: Row): string {
  return kontaktLabel(c) || "(ohne Namen)";
}

/**
 * Kontakt aus den Adressen wählen. Sucht in der Datenbank (nicht alle
 * Kontakte auf einmal laden) – ab zwei Buchstaben.
 */
export const ContactPicker = ({
  value,
  onChange,
  placeholder = "Kontakt suchen…",
  allowNone = true,
  noneLabel = "— Keiner —",
  className,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (id: string | null, label?: string) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [suche, setSuche] = useState("");
  const [begriff, setBegriff] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setBegriff(suche.trim()), 250);
    return () => clearTimeout(t);
  }, [suche]);

  const { data: gewaehlt } = useQuery({
    queryKey: ["broker", "contact-label", value],
    enabled: !!value,
    queryFn: async () => {
      const { data, error } = await db
        .from("contacts")
        .select("id, short_name, company_name, first_name, last_name, address_city")
        .eq("id", value!)
        .maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });

  const { data: treffer = [], isFetching } = useQuery({
    queryKey: ["broker", "contact-search", begriff],
    enabled: open && begriff.length >= 2,
    queryFn: async () => {
      const b = begriff.replace(/[%,()]/g, " ").trim();
      const teile = b.split(/\s+/).filter(Boolean);
      let q = db.from("contacts").select("id, short_name, company_name, first_name, last_name, address_city");
      for (const t of teile) {
        q = q.or(`short_name.ilike.%${t}%,company_name.ilike.%${t}%,first_name.ilike.%${t}%,last_name.ilike.%${t}%`);
      }
      const { data, error } = await q.order("short_name", { nullsFirst: false }).limit(30);
      if (error) {
        fehler("Suche in den Adressen hat nicht geklappt", error);
        return [];
      }
      return (data ?? []) as Row[];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("h-11 justify-between font-normal", className)}
        >
          <span className="truncate">{value ? (gewaehlt ? label(gewaehlt) : "…") : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Name oder Firma eingeben…" value={suche} onValueChange={setSuche} className="h-11" />
          <CommandList>
            {begriff.length < 2 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">Bitte mindestens zwei Buchstaben eingeben.</div>
            ) : isFetching ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Suche…
              </div>
            ) : (
              <CommandEmpty>Keine Treffer</CommandEmpty>
            )}
            <CommandGroup>
              {allowNone && value && (
                <CommandItem value="__none__" className="min-h-11" onSelect={() => { onChange(null); setOpen(false); }}>
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  {noneLabel}
                </CommandItem>
              )}
              {begriff.length >= 2 && !isFetching && treffer.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  className="min-h-11"
                  onSelect={() => { onChange(c.id, label(c)); setOpen(false); setSuche(""); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{label(c)}</span>
                  {c.address_city && <span className="ml-auto pl-2 text-xs text-muted-foreground">{c.address_city}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
