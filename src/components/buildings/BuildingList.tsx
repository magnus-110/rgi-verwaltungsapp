import { useState, useEffect } from "react";
import { Search, Plus, Building2, MapPin, Hash, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreateBuildingDialog } from "@/components/CreateBuildingDialog";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface Building {
  id: string;
  name: string;
  address: string;
  building_code: string;
  management_mode: "weg" | "rent";
  unit_count: number;
}

interface BuildingListProps {
  selectedBuildingId: string | null;
  onSelectBuilding: (id: string) => void;
}

export const BuildingList = ({ selectedBuildingId, onSelectBuilding }: BuildingListProps) => {
  const { managementMode } = useManagementMode();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: buildings = [], isLoading, refetch } = useQuery({
    queryKey: ['buildings-list', managementMode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, address, building_code, management_mode, unit_count")
        .eq("management_mode", managementMode)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = buildings.filter(b =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.building_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Gebäude</h2>
          <CreateBuildingDialog onBuildingCreated={() => refetch()} />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Building List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Laden...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {buildings.length === 0 ? "Noch keine Gebäude" : "Keine Treffer"}
            </div>
          ) : (
            filtered.map((building) => (
              <button
                key={building.id}
                onClick={() => onSelectBuilding(building.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg transition-colors group",
                  selectedBuildingId === building.id
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-muted/50 border border-transparent"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "p-1.5 rounded-md flex-shrink-0 mt-0.5",
                    selectedBuildingId === building.id
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium text-sm truncate",
                      selectedBuildingId === building.id && "text-primary"
                    )}>
                      {building.name}
                    </p>
                    <div className="flex items-center text-xs text-muted-foreground mt-0.5">
                      <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                      <span className="truncate">{building.address}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                        {building.building_code}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {building.unit_count} Einheiten
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
