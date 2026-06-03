import { useState } from "react";
import { useRgiProjects, useRgiClients, useDeleteRgiProject, type RgiProject } from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ProjectDialog } from "./ProjectDialog";

const SPARTE_LABEL: Record<string, string> = {
  weg: "WEG", rent: "Miete", sales: "Verkauf", letting: "Vermietung", other: "Sonstige",
};

export function ProjectsTab() {
  const { data: projects, isLoading } = useRgiProjects();
  const { data: clients } = useRgiClients();
  const del = useDeleteRgiProject();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RgiProject | null>(null);

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-1.5"><Plus className="w-4 h-4" />Neues Projekt</Button>
      </div>

      {isLoading ? <Skeleton className="h-32" /> : (projects ?? []).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Noch keine Projekte. Klick auf „Neues Projekt".</Card>
      ) : (
        <Card className="divide-y">
          {projects?.map((p) => (
            <div key={p.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="outline">{SPARTE_LABEL[p.sparte]}</Badge>
                  <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                  {p.default_hourly_rate && <span className="text-xs text-muted-foreground">{p.default_hourly_rate} €/h</span>}
                </div>
                <div className="text-xs text-muted-foreground">{clientName(p.client_id)}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => { if (confirm(`Projekt "${p.name}" löschen?`)) del.mutate(p.id); }}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <ProjectDialog open={open} onOpenChange={setOpen} project={editing} clients={clients ?? []} />
    </div>
  );
}
