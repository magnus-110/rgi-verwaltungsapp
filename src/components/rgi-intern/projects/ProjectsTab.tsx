import { useEffect, useMemo, useState } from "react";
import { useRgiProjects, useRgiClients, useDeleteRgiProject, type RgiProject } from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProjectDialog } from "./ProjectDialog";
import { supabase } from "@/integrations/supabase/client";

const SPARTE_LABEL: Record<string, string> = {
  weg: "WEG", rent: "Miete", sales: "Verkauf", letting: "Vermietung", other: "Sonstige",
};

type BuildingRow = { id: string; name: string; management_mode: "weg" | "rent" };

export function ProjectsTab() {
  const { data: projects, isLoading } = useRgiProjects();
  const { data: clients } = useRgiClients();
  const del = useDeleteRgiProject();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RgiProject | null>(null);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [modeTab, setModeTab] = useState<"weg" | "rent">("weg");

  useEffect(() => {
    supabase.from("buildings").select("id, name, management_mode").order("name")
      .then(({ data }) => setBuildings((data ?? []) as any));
  }, []);

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";

  const projectByBuilding = useMemo(() => {
    const map = new Map<string, RgiProject>();
    const clientBuildingMap = new Map<string, string>(); // client_id -> building_id
    (clients ?? []).forEach((c: any) => { if (c.building_id) clientBuildingMap.set(c.id, c.building_id); });
    (projects ?? []).forEach((p) => {
      const bId = clientBuildingMap.get(p.client_id);
      if (bId && !map.has(bId)) map.set(bId, p);
    });
    return map;
  }, [projects, clients]);

  const filteredBuildings = buildings.filter((b) => b.management_mode === modeTab);

  const openForBuilding = (b: BuildingRow) => {
    const existing = projectByBuilding.get(b.id);
    if (existing) {
      setEditing(existing);
    } else {
      setEditing({
        name: b.name,
        sparte: b.management_mode === "weg" ? "weg" : "rent",
        status: "active",
        default_hourly_rate: 77.35,
        __prefillBuildingId: b.id,
      } as any);
    }
    setOpen(true);
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-1.5"><Plus className="w-4 h-4" />Neues Projekt</Button>
      </div>

      {isLoading ? <Skeleton className="h-32" /> : (projects ?? []).length > 0 && (
        <Card className="divide-y">
          <div className="p-3 text-sm font-medium bg-muted/40">Aktive Projekte</div>
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

      <Card>
        <div className="p-3 border-b">
          <div className="text-sm font-medium mb-2">Alle Gebäude</div>
          <Tabs value={modeTab} onValueChange={(v) => setModeTab(v as any)}>
            <TabsList>
              <TabsTrigger value="weg">WEG ({buildings.filter(b => b.management_mode === "weg").length})</TabsTrigger>
              <TabsTrigger value="rent">Mietverwaltung ({buildings.filter(b => b.management_mode === "rent").length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="divide-y">
          {filteredBuildings.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Keine Gebäude gefunden.</div>}
          {filteredBuildings.map((b) => {
            const proj = projectByBuilding.get(b.id);
            return (
              <div key={b.id} className="p-3 flex items-center gap-3 hover:bg-muted/30 cursor-pointer" onClick={() => openForBuilding(b)}>
                <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{b.name}</span>
                    <Badge variant="outline">{b.management_mode === "weg" ? "WEG" : "Miete"}</Badge>
                    {proj ? (
                      <Badge variant="default" className="text-xs">Projekt aktiv</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Kein Projekt</Badge>
                    )}
                    {proj?.default_hourly_rate && <span className="text-xs text-muted-foreground">{proj.default_hourly_rate} €/h</span>}
                  </div>
                </div>
                {!proj && <Button size="sm" variant="outline" className="gap-1.5" onClick={(e) => { e.stopPropagation(); openForBuilding(b); }}><Plus className="w-3.5 h-3.5" />Projekt</Button>}
              </div>
            );
          })}
        </div>
      </Card>

      <ProjectDialog open={open} onOpenChange={setOpen} project={editing} clients={clients ?? []} />
    </div>
  );
}
