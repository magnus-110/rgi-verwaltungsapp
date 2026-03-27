import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Pause, FileText, Inbox, Building2, ExternalLink } from "lucide-react";
import { format as formatDate } from "date-fns";
import { de } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

export const SubmittedTopsManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterBuildingId, setFilterBuildingId] = useState<string>("all");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [acceptTopId, setAcceptTopId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("");

  // Fetch all submitted TOPs
  const { data: allTops = [], isLoading } = useQuery({
    queryKey: ["admin-submitted-tops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_submitted_tops")
        .select("*, buildings(id, name, address), profiles!etv_submitted_tops_submitted_by_user_id_fkey(first_name, last_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Unique buildings from TOPs
  const buildingMap = new Map<string, any>();
  allTops.forEach((t: any) => {
    if (t.buildings) buildingMap.set(t.buildings.id, t.buildings);
  });
  const buildings = Array.from(buildingMap.values());

  const filteredTops = filterBuildingId === "all"
    ? allTops
    : allTops.filter((t: any) => t.building_id === filterBuildingId);

  const pendingTops = filteredTops.filter((t: any) => t.status === "pending");
  const processedTops = filteredTops.filter((t: any) => t.status !== "pending");

  // Fetch draft meetings for the accept dialog
  const acceptTop = allTops.find((t: any) => t.id === acceptTopId);
  const { data: draftMeetings = [] } = useQuery({
    queryKey: ["draft-meetings-for-building", acceptTop?.building_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("id, title, meeting_date")
        .eq("building_id", acceptTop!.building_id)
        .in("status", ["draft", "published"])
        .order("meeting_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!acceptTop?.building_id,
  });

  const acceptMutation = useMutation({
    mutationFn: async (top: any) => {
      // Get next sort order for the meeting
      const { data: existingItems } = await supabase
        .from("etv_agenda_items")
        .select("sort_order")
        .eq("meeting_id", selectedMeetingId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = ((existingItems?.[0]?.sort_order) || 0) + 1;

      const { error: insertErr } = await supabase.from("etv_agenda_items").insert({
        meeting_id: selectedMeetingId,
        title: top.title,
        description: top.description,
        sort_order: nextOrder,
        voting_principle: "mea",
        category: "sonstiges",
        attachment_paths: top.attachment_paths,
      });
      if (insertErr) throw insertErr;

      const { error: updateErr } = await supabase
        .from("etv_submitted_tops")
        .update({ status: "accepted", accepted_into_meeting_id: selectedMeetingId, updated_at: new Date().toISOString() })
        .eq("id", top.id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      toast({ title: "TOP in Versammlung übernommen" });
      setAcceptTopId(null);
      setSelectedMeetingId("");
      queryClient.invalidateQueries({ queryKey: ["admin-submitted-tops"] });
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note?: string }) => {
      const { error } = await supabase
        .from("etv_submitted_tops")
        .update({ status, admin_notes: note || null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Status aktualisiert" });
      setRejectId(null);
      setRejectNote("");
      queryClient.invalidateQueries({ queryKey: ["admin-submitted-tops"] });
    },
  });

  const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Ausstehend", variant: "outline" },
    accepted: { label: "Aufgenommen", variant: "default" },
    rejected: { label: "Abgelehnt", variant: "destructive" },
    deferred: { label: "Zurückgestellt", variant: "secondary" },
  };

  const renderTopCard = (top: any, showActions: boolean) => {
    const submitter = top.profiles;
    const name = submitter ? `${submitter.first_name || ""} ${submitter.last_name || ""}`.trim() : "Unbekannt";
    const statusInfo = statusLabels[top.status] || statusLabels.pending;

    return (
      <Card key={top.id} className={showActions ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" : ""}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h5 className="font-semibold text-sm">{top.title}</h5>
                <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
              </div>
              {top.description && (
                <p className="text-xs text-muted-foreground mt-1">{top.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {top.buildings?.name}
                </span>
                <span>•</span>
                <span>von {name}</span>
                <span>•</span>
                <span>{formatDate(new Date(top.created_at), "dd.MM.yyyy", { locale: de })}</span>
                {top.attachment_paths?.length > 0 && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {top.attachment_paths.length} Anhang/Anhänge
                    </span>
                  </>
                )}
              </div>
              {top.admin_notes && (
                <p className="text-xs text-muted-foreground mt-2 italic border-l-2 border-muted pl-2">
                  {top.admin_notes}
                </p>
              )}
            </div>
            {showActions && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  className="gap-1 h-8"
                  onClick={() => { setAcceptTopId(top.id); setSelectedMeetingId(""); }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Übernehmen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-8"
                  onClick={() => rejectMutation.mutate({ id: top.id, status: "deferred" })}
                  disabled={rejectMutation.isPending}
                >
                  <Pause className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 h-8 text-destructive hover:text-destructive"
                  onClick={() => { setRejectId(top.id); setRejectNote(""); }}
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      {buildings.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Gebäude:</span>
          <Select value={filterBuildingId} onValueChange={setFilterBuildingId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Gebäude</SelectItem>
              {buildings.map((b: any) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Pending */}
      {pendingTops.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Offene Anträge ({pendingTops.length})</h3>
          </div>
          {pendingTops.map((top: any) => renderTopCard(top, true))}
        </div>
      )}

      {/* Processed */}
      {processedTops.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Bearbeitete Anträge</h3>
          {processedTops.map((top: any) => renderTopCard(top, false))}
        </div>
      )}

      {filteredTops.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Keine eingereichten Anträge vorhanden.</p>
          </CardContent>
        </Card>
      )}

      {/* Accept dialog: select meeting */}
      <Dialog open={!!acceptTopId} onOpenChange={() => setAcceptTopId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>In Versammlung übernehmen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Wählen Sie die Versammlung, in welche der TOP aufgenommen werden soll.
            </p>
            {draftMeetings.length === 0 ? (
              <p className="text-sm text-destructive">
                Es gibt keine Versammlungen im Status "Entwurf" oder "Freigeschaltet" für dieses Gebäude. Bitte erstellen Sie zuerst eine Versammlung.
              </p>
            ) : (
              <Select value={selectedMeetingId} onValueChange={setSelectedMeetingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Versammlung wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {draftMeetings.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title} — {formatDate(new Date(m.meeting_date), "dd.MM.yyyy", { locale: de })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAcceptTopId(null)}>Abbrechen</Button>
              <Button
                onClick={() => acceptMutation.mutate(acceptTop)}
                disabled={!selectedMeetingId || acceptMutation.isPending}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                Übernehmen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={() => setRejectId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Antrag ablehnen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Begründung (optional, wird dem Eigentümer angezeigt)..."
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectId(null)}>Abbrechen</Button>
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate({ id: rejectId!, status: "rejected", note: rejectNote })}
                disabled={rejectMutation.isPending}
              >
                Ablehnen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
