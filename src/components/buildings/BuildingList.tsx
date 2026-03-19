import { useState } from "react";
import { Search, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreateBuildingDialog } from "@/components/CreateBuildingDialog";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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
        .select("id, name, management_mode, unit_count")
        .eq("management_mode", managementMode)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = buildings.filter(b =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Gebäude</h2>
          <CreateBuildingDialog onBuildingCreated={() => refetch()} />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

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
                  "w-full text-left p-3 rounded-lg transition-colors",
                  selectedBuildingId === building.id
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-muted/50 border border-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-1.5 rounded-md flex-shrink-0",
                    selectedBuildingId === building.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
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
                    <p className="text-xs text-muted-foreground">{building.unit_count} Einheiten</p>
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
