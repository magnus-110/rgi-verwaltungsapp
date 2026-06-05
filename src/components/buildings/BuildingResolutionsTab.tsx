import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Scale, Search, CheckCircle2, XCircle, Plus } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useState } from "react";
import { CreateResolutionDialog } from "./CreateResolutionDialog";

interface BuildingResolutionsTabProps {
  buildingId: string;
}

export const BuildingResolutionsTab = ({ buildingId }: BuildingResolutionsTabProps) => {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: resolutions = [], isLoading } = useQuery({
    queryKey: ["building-resolutions", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_resolutions")
        .select(`
          *,
          etv_meetings(title, meeting_date)
        `)
        .eq("building_id", buildingId)
        .order("resolved_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = resolutions.filter((r: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.resolution_text?.toLowerCase().includes(s) ||
      r.resolution_number?.toLowerCase().includes(s) ||
      r.etv_meetings?.title?.toLowerCase().includes(s)
    );
  });

  if (isLoading) {
    return <div className="text-center text-muted-foreground py-8">Laden...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Beschlüsse durchsuchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Eintragen
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Scale className="h-12 w-12 mx-auto mb-4" />
            <p className="font-medium">Keine Beschlüsse vorhanden</p>
            <p className="text-sm">Beschlüsse werden nach Abstimmungen in der Versammlung hier angezeigt.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => {
            const meeting = r.etv_meetings;
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {r.result === "passed" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      )}
                      <span className="font-semibold text-sm">{r.resolution_number}</span>
                      <Badge variant={r.result === "passed" ? "default" : "destructive"} className="text-xs">
                        {r.result === "passed" ? "Angenommen" : "Abgelehnt"}
                      </Badge>
                      {!r.published && <Badge variant="outline" className="text-xs">Entwurf</Badge>}
                    </div>
                    <p className="text-sm">{r.resolution_text}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{meeting?.title}</span>
                      <span>{r.resolved_at ? format(new Date(r.resolved_at), "dd.MM.yyyy", { locale: de }) : ""}</span>
                      <span>Ja: {r.yes_count} | Nein: {r.no_count} | Enth.: {r.abstain_count}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <CreateResolutionDialog buildingId={buildingId} open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
};
