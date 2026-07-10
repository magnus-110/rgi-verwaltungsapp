import { useState, useRef, memo } from "react";
import { Search, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CreateBuildingDialog } from "@/components/CreateBuildingDialog";
import { supabase } from "@/integrations/supabase/client";
import { useManagementMode } from "@/hooks/useManagementMode";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { IbanChangeBadge } from "@/components/admin/IbanChangeBadge";

interface BuildingListProps {
  selectedBuildingId: string | null;
  onSelectBuilding: (id: string) => void;
}

interface BuildingRowData {
  id: string;
  name: string;
  unit_count: number;
  billing_only?: boolean;
  city?: string | null;
}

const BuildingRow = memo(function BuildingRow({
  building,
  selected,
  onSelect,
}: {
  building: BuildingRowData;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(building.id)}
      className={cn(
        "w-full text-left p-3 min-h-[56px] md:min-h-0 rounded-lg transition-colors active:scale-[0.98]",
        selected
          ? "bg-primary/10 border border-primary/20"
          : "hover:bg-muted/50 active:bg-muted border border-transparent"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-1.5 rounded-md flex-shrink-0",
          selected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
        )}>
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={cn(
              "font-medium text-sm truncate",
              selected && "text-primary"
            )}>
              {building.name}
              {building.city && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground/70">{building.city}</span>
              )}
            </p>
            {building.billing_only && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 whitespace-nowrap">
                Nur Abrechnung
              </span>
            )}
            <IbanChangeBadge buildingId={building.id} compact />
          </div>
          <p className="text-xs text-muted-foreground">{building.unit_count} Einheiten</p>
        </div>
      </div>
    </button>
  );
});

export const BuildingList = ({ selectedBuildingId, onSelectBuilding }: BuildingListProps) => {
  const { managementMode } = useManagementMode();
  const [searchTerm, setSearchTerm] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const { data: buildings = [], isLoading, refetch } = useQuery({
    queryKey: ['buildings-list', managementMode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id, name, management_mode, unit_count, billing_only, city")
        .eq("management_mode", managementMode)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as BuildingRowData[];
    },
  });

  const filtered = buildings.filter(b => {
    const term = searchTerm.toLowerCase();
    return (
      b.name.toLowerCase().includes(term) ||
      ((b as any).city || "").toLowerCase().includes(term)
    );
  });

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  return (
    <div className="flex flex-col h-full md:border-r md:border-border bg-card">
      <div className="p-3 md:p-4 border-b border-border space-y-3 sticky top-0 bg-card z-10">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Gebäude</h2>
          <CreateBuildingDialog onBuildingCreated={() => refetch()} />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-11 md:h-9" />
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Laden...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {buildings.length === 0 ? "Noch keine Gebäude" : "Keine Treffer"}
          </div>
        ) : (
          <div
            className="p-2 relative"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const building = filtered[vi.index];
              return (
                <div
                  key={building.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full px-0 pb-1"
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <BuildingRow
                    building={building}
                    selected={selectedBuildingId === building.id}
                    onSelect={onSelectBuilding}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
