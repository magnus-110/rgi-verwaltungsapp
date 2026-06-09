import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Scale, Search, CheckCircle2, XCircle, Plus, Wrench, ExternalLink, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const toggleActionable = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("etv_resolutions").update({ is_actionable: value } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast({
        title: vars.value ? "Als umsetzungsrelevant markiert" : "Markierung entfernt",
        description: vars.value ? "Es wurde automatisch ein Vorgang angelegt." : undefined,
      });
      qc.invalidateQueries({ queryKey: ["building-resolutions", buildingId] });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const togglePublished = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("etv_resolutions").update({ published: value } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast({
        title: vars.value ? "Im Eigentümer-Portal veröffentlicht" : "Aus dem Portal entfernt",
        description: vars.value ? "Der Beschluss ist jetzt für Eigentümer sichtbar." : undefined,
      });
      qc.invalidateQueries({ queryKey: ["building-resolutions", buildingId] });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const getResolutionDateMs = (resolution: any) => {
    const dateValue = resolution.resolved_at || resolution.etv_meetings?.meeting_date || resolution.created_at;
    const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };

  const getResolutionNumber = (resolutionNumber?: string | null) => {
    const matches = resolutionNumber?.match(/\d+/g);
    return matches ? Number(matches[matches.length - 1]) : 0;
  };

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

  const filtered = resolutions
    .filter((r: any) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        r.resolution_text?.toLowerCase().includes(s) ||
        r.resolution_number?.toLowerCase().includes(s) ||
        r.etv_meetings?.title?.toLowerCase().includes(s)
      );
    })
    .sort((a: any, b: any) => {
      const dateDiff = getResolutionDateMs(b) - getResolutionDateMs(a);
      if (dateDiff !== 0) return dateDiff;
      return getResolutionNumber(b.resolution_number) - getResolutionNumber(a.resolution_number);
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
                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      )}
                      <span className="font-semibold text-sm">{r.resolution_number}</span>
                      <Badge
                        variant={r.result === "passed" ? "outline" : "destructive"}
                        className={r.result === "passed" ? "text-xs border-transparent bg-success text-primary-foreground" : "text-xs"}
                      >
                        {r.result === "passed" ? "Angenommen" : "Abgelehnt"}
                      </Badge>
                      {r.published ? (
                        <Badge variant="outline" className="text-xs gap-1 border-success/40 bg-success/10 text-success">
                          <Eye className="h-3 w-3" /> Veröffentlicht
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs gap-1 px-2"
                          onClick={() => togglePublished.mutate({ id: r.id, value: true })}
                          disabled={togglePublished.isPending}
                        >
                          <EyeOff className="h-3 w-3" /> Entwurf – jetzt veröffentlichen
                        </Button>
                      )}
                      {r.is_actionable && (
                        <Badge variant="outline" className="text-xs gap-1 border-primary/40 bg-primary/10 text-primary">
                          <Wrench className="h-3 w-3" /> Umzusetzen
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">{r.resolution_text}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{meeting?.title}</span>
                      <span>{r.resolved_at ? format(new Date(r.resolved_at), "dd.MM.yyyy", { locale: de }) : ""}</span>
                      <span>Ja: {r.yes_count} | Nein: {r.no_count} | Enth.: {r.abstain_count}</span>
                    </div>
                    {r.result === "passed" && (
                      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 mt-2">
                        <div className="flex items-center gap-2 text-xs">
                          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-foreground">Umsetzungsrelevant</div>
                            <div className="text-muted-foreground">Legt automatisch einen Vorgang an.</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.case_id && (
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => navigate(`/tickets/vorgaenge?case=${r.case_id}`)}>
                              <ExternalLink className="h-3 w-3" /> Vorgang
                            </Button>
                          )}
                          <Switch
                            checked={!!r.is_actionable}
                            onCheckedChange={(v) => toggleActionable.mutate({ id: r.id, value: v })}
                            disabled={toggleActionable.isPending}
                          />
                        </div>
                      </div>
                    )}
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
