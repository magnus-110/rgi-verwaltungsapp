import { cn } from "@/lib/utils";

export interface BuildingChip {
  id: string;
  name: string;
}

interface Props {
  buildings: BuildingChip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

export function BuildingFilterChips({ buildings, selectedId, onSelect, className }: Props) {
  if (buildings.length <= 1) return null;
  return (
    <div className={cn("flex gap-2 flex-wrap", className)}>
      {buildings.map((b) => {
        const active = selectedId === b.id;
        return (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
            className={cn(
              "h-8 px-3 rounded-full text-[12px] font-medium transition-colors border",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border/60 hover:bg-muted/60"
            )}
          >
            {b.name}
          </button>
        );
      })}
    </div>
  );
}
