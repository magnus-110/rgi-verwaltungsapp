import { useState } from "react";
import { useRgiClients, useDeleteRgiClient, type RgiClient } from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientDialog } from "./ClientDialog";
import { Badge } from "@/components/ui/badge";

export function ClientsTab() {
  const { data, isLoading } = useRgiClients();
  const del = useDeleteRgiClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RgiClient | null>(null);
  const [search, setSearch] = useState("");

  const filtered = (data ?? []).filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Suche…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-1.5"><Plus className="w-4 h-4" />Neuer Kunde</Button>
      </div>

      {isLoading ? <Skeleton className="h-64" /> : (
        <Card className="divide-y">
          {filtered.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Noch keine Kunden angelegt.</div>}
          {filtered.map((c) => (
            <div key={c.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{c.name}</span>
                  <Badge variant="secondary" className="text-xs">{c.type}</Badge>
                  {c.customer_no && <span className="text-xs text-muted-foreground">#{c.customer_no}</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {[c.address_line1, c.zip, c.city].filter(Boolean).join(", ")}
                  {c.email && ` · ${c.email}`}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Kunde "${c.name}" löschen?`)) del.mutate(c.id); }}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <ClientDialog open={open} onOpenChange={setOpen} client={editing} />
    </div>
  );
}
