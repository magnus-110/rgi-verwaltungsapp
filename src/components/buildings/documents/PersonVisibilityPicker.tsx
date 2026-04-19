import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Users } from "lucide-react";

interface Person {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
}

interface PersonVisibilityPickerProps {
  contacts: Person[];
  selectedIds: string[];
  onToggle: (contactId: string) => void;
}

export function PersonVisibilityPicker({ contacts, selectedIds, onToggle }: PersonVisibilityPickerProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c => {
      const name = `${c.company_name || ''} ${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      return name.includes(q);
    });
  }, [contacts, search]);

  const displayName = (c: Person) =>
    c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unbenannt';

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="gap-1">
          <Users className="h-3 w-3" />
          {selectedIds.length} ausgewählt
        </Badge>
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-7 h-8 text-sm"
        />
      </div>
      <ScrollArea className="h-48">
        <div className="space-y-1 pr-2">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground p-2 text-center">
              {contacts.length === 0 ? "Keine Eigentümer am Gebäude." : "Keine Treffer."}
            </p>
          )}
          {filtered.map(c => (
            <label
              key={c.id}
              className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer"
            >
              <Checkbox
                checked={selectedIds.includes(c.id)}
                onCheckedChange={() => onToggle(c.id)}
              />
              <span className="text-sm flex-1 truncate">{displayName(c)}</span>
            </label>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
