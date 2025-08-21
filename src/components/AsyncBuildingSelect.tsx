
import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useManagementMode } from "@/hooks/useManagementMode";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code?: string;
}

interface AsyncBuildingSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const AsyncBuildingSelect = ({
  value,
  onValueChange,
  placeholder = "Gebäude auswählen...",
  className
}: AsyncBuildingSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { managementMode } = useManagementMode();

  const { data: buildings = [], isLoading } = useQuery({
    queryKey: ['buildings-search', managementMode, search],
    queryFn: async () => {
      let query = supabase
        .from('buildings')
        .select('id, name, address, building_code')
        .eq('management_mode', managementMode)
        .order('name');

      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%,building_code.ilike.%${search}%`);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data as Building[];
    },
    enabled: open || !!search,
  });

  const selectedBuilding = buildings.find(building => building.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between", className)}
        >
          {selectedBuilding ? (
            <span className="truncate">
              {selectedBuilding.name} - {selectedBuilding.address}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput
            placeholder="Gebäude suchen..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="py-4 text-center text-sm">Lädt...</div>
            ) : (
              <>
                <CommandEmpty>Keine Gebäude gefunden.</CommandEmpty>
                <CommandGroup>
                  {buildings.map((building) => (
                    <CommandItem
                      key={building.id}
                      value={building.id}
                      onSelect={(currentValue) => {
                        onValueChange(currentValue === value ? "" : currentValue);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === building.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{building.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {building.address}
                          {building.building_code && ` • Code: ${building.building_code}`}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
