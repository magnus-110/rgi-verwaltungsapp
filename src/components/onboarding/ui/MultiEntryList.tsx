import { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiEntryListProps<T> {
  items: T[];
  onChange: (next: T[]) => void;
  newItem: () => T;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
  addLabel?: string;
  minItems?: number;
}

export function MultiEntryList<T extends object>({
  items,
  onChange,
  newItem,
  renderItem,
  addLabel = "Weiteren Eintrag hinzufügen",
  minItems = 1,
}: MultiEntryListProps<T>) {
  const list = items.length > 0 ? items : [newItem()];

  const update = (idx: number, patch: Partial<T>) => {
    const next = list.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  const add = () => onChange([...list, newItem()]);

  return (
    <div>
      {list.map((item, idx) => (
        <div key={idx}>
          {idx > 0 && <div className="h-px bg-foreground/[0.055]" />}
          <div className="px-4 py-2.5 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              {renderItem(item, (patch) => update(idx, patch), idx)}
            </div>
            {list.length > minItems && (
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label="Entfernen"
                className={cn(
                  "size-[22px] shrink-0 rounded-full grid place-items-center",
                  "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 transition"
                )}
              >
                <X className="size-3" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="h-px bg-foreground/[0.055]" />
      <button
        type="button"
        onClick={add}
        className="w-full px-4 py-3 flex items-center gap-2.5 text-[13px] font-medium text-primary hover:bg-accent/40 transition"
      >
        <span className="size-[22px] rounded-full border-[1.5px] border-primary bg-accent grid place-items-center">
          <Plus className="size-3" strokeWidth={2.5} />
        </span>
        {addLabel}
      </button>
    </div>
  );
}
