import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, Building2, BookOpen, Search, Check, Layers, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code: string;
}

export type KnowledgeScope = 'general' | 'specific' | 'all';

interface KnowledgeScopeSelectorProps {
  scope: KnowledgeScope;
  onScopeChange: (scope: KnowledgeScope) => void;
  selectedBuildingIds: string[];
  onBuildingChange: (ids: string[]) => void;
  includeGeneral: boolean;
  onIncludeGeneralChange: (include: boolean) => void;
  buildings: Building[];
}

interface Manager {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
}

interface BuildingManager {
  building_id: string;
  user_id: string;
}

export function KnowledgeScopeSelector({
  scope,
  onScopeChange,
  selectedBuildingIds,
  onBuildingChange,
  includeGeneral,
  onIncludeGeneralChange,
  buildings,
}: KnowledgeScopeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [managerFilter, setManagerFilter] = useState<string>("all");

  // Fetch managers (admins)
  const { data: managers = [] } = useQuery({
    queryKey: ['nova-managers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .eq('role', 'admin')
        .order('first_name');

      if (error) throw error;
      return (data || []) as Manager[];
    },
  });

  // Fetch building-manager assignments
  const { data: buildingManagers = [] } = useQuery({
    queryKey: ['nova-building-managers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('building_managers')
        .select('building_id, user_id');

      if (error) throw error;
      return (data || []) as BuildingManager[];
    },
  });

  // Filter buildings by search and manager
  const filteredBuildings = useMemo(() => {
    let result = buildings.filter(
      (b) =>
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.building_code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (managerFilter !== "all") {
      const managerBuildingIds = buildingManagers
        .filter(bm => bm.user_id === managerFilter)
        .map(bm => bm.building_id);
      result = result.filter(b => managerBuildingIds.includes(b.id));
    }

    return result;
  }, [buildings, searchQuery, managerFilter, buildingManagers]);

  const selectedBuildings = buildings.filter((b) => selectedBuildingIds.includes(b.id));

  const getScopeLabel = () => {
    switch (scope) {
      case 'general':
        return "Allgemein";
      case 'specific':
        if (selectedBuildings.length === 0) {
          return "Spezifische Gebäude";
        } else if (selectedBuildings.length === 1) {
          return selectedBuildings[0].name;
        } else {
          return `${selectedBuildings.length} Gebäude`;
        }
      case 'all':
        return "Alle Gebäude";
    }
  };

  const getScopeIcon = () => {
    switch (scope) {
      case 'general':
        return <BookOpen className="h-4 w-4" />;
      case 'all':
        return <Layers className="h-4 w-4" />;
      case 'specific':
        return <Building2 className="h-4 w-4" />;
    }
  };

  const toggleBuilding = (buildingId: string) => {
    if (selectedBuildingIds.includes(buildingId)) {
      onBuildingChange(selectedBuildingIds.filter(id => id !== buildingId));
    } else {
      onBuildingChange([...selectedBuildingIds, buildingId]);
    }
  };

  const selectAllFiltered = () => {
    const allFilteredIds = filteredBuildings.map(b => b.id);
    const newSelected = [...new Set([...selectedBuildingIds, ...allFilteredIds])];
    onBuildingChange(newSelected);
  };

  const deselectAllFiltered = () => {
    const filteredIds = filteredBuildings.map(b => b.id);
    onBuildingChange(selectedBuildingIds.filter(id => !filteredIds.includes(id)));
  };

  const allFilteredSelected = filteredBuildings.length > 0 && 
    filteredBuildings.every(b => selectedBuildingIds.includes(b.id));

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 h-9 px-3 font-normal bg-background border-border hover:bg-muted"
        >
          {getScopeIcon()}
          <span className="max-w-[200px] truncate">{getScopeLabel()}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        align="start" 
        className="w-80 p-0"
        sideOffset={8}
      >
        <div className="p-2 space-y-1">
          {/* Allgemein */}
          <button
            onClick={() => {
              onScopeChange('general');
              setIsOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
              scope === 'general' 
                ? "bg-primary/10 text-primary" 
                : "hover:bg-muted"
            )}
          >
            <BookOpen className="h-4 w-4" />
            <div className="flex-1">
              <p className="text-sm font-medium">Allgemein</p>
              <p className="text-xs text-muted-foreground">Suche nur in allgemeinen Dokumenten</p>
            </div>
            {scope === 'general' && <Check className="h-4 w-4" />}
          </button>

          {/* Alle Gebäude */}
          <button
            onClick={() => {
              onScopeChange('all');
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
              scope === 'all' 
                ? "bg-primary/10 text-primary" 
                : "hover:bg-muted"
            )}
          >
            <Layers className="h-4 w-4" />
            <div className="flex-1">
              <p className="text-sm font-medium">Alle Gebäude</p>
              <p className="text-xs text-muted-foreground">Durchsuche alle Gebäude-Dokumente</p>
            </div>
            {scope === 'all' && <Check className="h-4 w-4" />}
          </button>

          {scope === 'all' && (
            <div className="pl-10 pr-3 pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={includeGeneral}
                  onCheckedChange={(checked) => onIncludeGeneralChange(checked as boolean)}
                />
                <span className="text-xs text-muted-foreground">
                  Auch allgemeines Wissen einbeziehen
                </span>
              </label>
            </div>
          )}

          {/* Spezifische Gebäude */}
          <button
            onClick={() => {
              onScopeChange('specific');
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
              scope === 'specific' 
                ? "bg-primary/10 text-primary" 
                : "hover:bg-muted"
            )}
          >
            <Building2 className="h-4 w-4" />
            <div className="flex-1">
              <p className="text-sm font-medium">Spezifische Gebäude</p>
              <p className="text-xs text-muted-foreground">Wähle ein oder mehrere Gebäude aus</p>
            </div>
            {scope === 'specific' && <Check className="h-4 w-4" />}
          </button>

          {scope === 'specific' && (
            <div className="px-3 pt-1 pb-2 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Gebäude suchen..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>

              {/* Manager Filter */}
              {managers.length > 0 && (
                <Select value={managerFilter} onValueChange={setManagerFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <User className="h-3.5 w-3.5 mr-1.5 opacity-50" />
                    <SelectValue placeholder="Verwalter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Verwalter</SelectItem>
                    {managers.map((manager) => (
                      <SelectItem key={manager.user_id} value={manager.user_id}>
                        {manager.first_name} {manager.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Select/Deselect All */}
              {filteredBuildings.length > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{selectedBuildingIds.length} ausgewählt</span>
                  <button
                    type="button"
                    onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
                    className="text-primary hover:underline"
                  >
                    {allFilteredSelected ? "Alle abwählen" : "Alle auswählen"}
                  </button>
                </div>
              )}
              
              <ScrollArea className="h-[180px]">
                <div className="space-y-0.5">
                  {filteredBuildings.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Keine Gebäude gefunden
                    </p>
                  ) : (
                    filteredBuildings.map((building) => (
                      <button
                        key={building.id}
                        onClick={() => toggleBuilding(building.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors",
                          selectedBuildingIds.includes(building.id)
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        )}
                      >
                        <Checkbox
                          checked={selectedBuildingIds.includes(building.id)}
                          className="pointer-events-none"
                        />
                        <span className="flex-1 truncate">{building.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <Checkbox
                  checked={includeGeneral}
                  onCheckedChange={(checked) => onIncludeGeneralChange(checked as boolean)}
                />
                <span className="text-xs text-muted-foreground">
                  Auch allgemeines Wissen einbeziehen
                </span>
              </label>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
