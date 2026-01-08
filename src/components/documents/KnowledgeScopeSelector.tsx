import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, Building2, Globe, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
  selectedBuildingId: string | null;
  onBuildingChange: (id: string | null) => void;
  includeGeneral: boolean;
  onIncludeGeneralChange: (include: boolean) => void;
  buildings: Building[];
}

export function KnowledgeScopeSelector({
  scope,
  onScopeChange,
  selectedBuildingId,
  onBuildingChange,
  includeGeneral,
  onIncludeGeneralChange,
  buildings,
}: KnowledgeScopeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredBuildings = buildings.filter(
    (b) =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.building_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);

  const getScopeLabel = () => {
    switch (scope) {
      case 'general':
        return "Nur Allgemeines Wissen";
      case 'specific':
        return selectedBuilding 
          ? `${selectedBuilding.name}` 
          : "Spezifisches Gebäude";
      case 'all':
        return "Alle Gebäude";
    }
  };

  const getScopeIcon = () => {
    switch (scope) {
      case 'general':
        return <Globe className="h-4 w-4" />;
      case 'specific':
      case 'all':
        return <Building2 className="h-4 w-4" />;
    }
  };

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
          {/* Nur Allgemeines Wissen */}
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
            <Globe className="h-4 w-4" />
            <div className="flex-1">
              <p className="text-sm font-medium">Nur Allgemeines Wissen</p>
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
            <Building2 className="h-4 w-4" />
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

          {/* Spezifisches Gebäude */}
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
              <p className="text-sm font-medium">Spezifisches Gebäude</p>
              <p className="text-xs text-muted-foreground">Wähle ein bestimmtes Gebäude aus</p>
            </div>
            {scope === 'specific' && <Check className="h-4 w-4" />}
          </button>

          {scope === 'specific' && (
            <div className="px-3 pt-1 pb-2 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Gebäude suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
              
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
                        onClick={() => {
                          onBuildingChange(building.id);
                          setIsOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors",
                          selectedBuildingId === building.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        )}
                      >
                        <span className="flex-1 truncate">{building.name}</span>
                        {selectedBuildingId === building.id && (
                          <Check className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
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
