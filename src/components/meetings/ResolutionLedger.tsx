import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Search, Scale, CheckCircle2, XCircle, StickyNote, Save, Pencil, Wrench, ExternalLink, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface ResolutionLedgerProps {
  buildingFilter?: string;
}

export const ResolutionLedger = ({ buildingFilter: externalBuildingFilter }: ResolutionLedgerProps = {}) => {
  const [search, setSearch] = useState("");
  const activeBuildingFilter = externalBuildingFilter || "all";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const toggleActionableMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("etv_resolutions")
        .update({ is_actionable: value } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast({
        title: vars.value ? "Als umsetzungsrelevant markiert" : "Markierung entfernt",
        description: vars.value ? "Es wurde automatisch ein Vorgang angelegt." : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["etv-resolutions"] });
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
    queryKey: ["etv-resolutions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_resolutions")
        .select(`
          *,
          buildings!inner(name, address),
          etv_meetings(title, meeting_date)
        `)
        .order("resolved_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Initialize note drafts from loaded data
  useEffect(() => {
    setNoteDrafts((prev) => {
      const next = { ...prev };
      resolutions.forEach((r: any) => {
        if (!(r.id in next)) next[r.id] = r.notes || "";
      });
      return next;
    });
  }, [resolutions]);

  const saveNoteMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("etv_resolutions")
        .update({ notes: notes || null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Bemerkung gespeichert" });
      setEditingNoteId(null);
      queryClient.invalidateQueries({ queryKey: ["etv-resolutions"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const filtered = resolutions
    .filter((r: any) => {
      const matchesSearch =
        !search ||
        r.resolution_text?.toLowerCase().includes(search.toLowerCase()) ||
        r.resolution_number?.toLowerCase().includes(search.toLowerCase()) ||
        r.buildings?.name?.toLowerCase().includes(search.toLowerCase());
      const matchesBuilding = activeBuildingFilter === "all" || r.building_id === activeBuildingFilter;
      return matchesSearch && matchesBuilding;
    })
    .sort((a: any, b: any) => {
      const dateDiff = getResolutionDateMs(b) - getResolutionDateMs(a);
      if (dateDiff !== 0) return dateDiff;
      return getResolutionNumber(b.resolution_number) - getResolutionNumber(a.resolution_number);
    });

  return (
    <div className="space-y-4">
      {/* Search only - building filter is handled by parent */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Beschlüsse durchsuchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Scale className="h-12 w-12 mx-auto mb-4" />
            <p className="font-medium">Keine Beschlüsse gefunden</p>
            <p className="text-sm">Beschlüsse werden automatisch nach Abstimmungen in der Versammlung gespeichert.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => {
            const meeting = r.etv_meetings;
            const building = r.buildings;
            const isEditingNote = editingNoteId === r.id;
            return (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {!r.published && <Badge variant="outline" className="text-xs">Entwurf</Badge>}
                        {r.is_actionable && (
                          <Badge variant="outline" className="text-xs gap-1 border-primary/40 bg-primary/10 text-primary">
                            <Wrench className="h-3 w-3" /> Umzusetzen
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{r.resolution_text}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                        <span>{building?.name}</span>
                        <span>{meeting?.title}</span>
                        <span>{r.resolved_at ? format(new Date(r.resolved_at), "dd.MM.yyyy", { locale: de }) : ""}</span>
                        <span>Ja: {r.yes_count} | Nein: {r.no_count} | Enth.: {r.abstain_count}</span>
                      </div>
                    </div>
                  </div>

                  {/* Umsetzungsrelevanz */}
                  {r.result === "passed" && (
                    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-2 text-xs">
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-foreground">Umsetzungsrelevant</div>
                          <div className="text-muted-foreground">Erstellt automatisch einen Vorgang zur Nachverfolgung.</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.case_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-xs"
                            onClick={() => navigate(`/tickets/vorgaenge?case=${r.case_id}`)}
                          >
                            <ExternalLink className="h-3 w-3" /> Vorgang
                          </Button>
                        )}
                        <Switch
                          checked={!!r.is_actionable}
                          onCheckedChange={(v) => toggleActionableMutation.mutate({ id: r.id, value: v })}
                          disabled={toggleActionableMutation.isPending}
                        />
                      </div>
                    </div>
                  )}

                  {/* Bemerkung (notes) */}
                  <div className="border-t pt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <StickyNote className="h-3 w-3" /> Bemerkung
                      </p>
                      {isEditingNote ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => {
                              setNoteDrafts((prev) => ({ ...prev, [r.id]: r.notes || "" }));
                              setEditingNoteId(null);
                            }}
                          >
                            Abbrechen
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={saveNoteMutation.isPending}
                            onClick={() => saveNoteMutation.mutate({ id: r.id, notes: noteDrafts[r.id] ?? "" })}
                          >
                            <Save className="h-3 w-3" /> Speichern
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                          onClick={() => setEditingNoteId(r.id)}
                        >
                          <Pencil className="h-3 w-3" /> Bearbeiten
                        </Button>
                      )}
                    </div>
                    {isEditingNote ? (
                      <Textarea
                        value={noteDrafts[r.id] ?? ""}
                        onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Bemerkung zum Beschluss hinzufügen..."
                        rows={3}
                        className="text-sm"
                      />
                    ) : r.notes ? (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/40 rounded-md p-2 border">
                        {r.notes}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Keine Bemerkung hinterlegt.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
