import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Pause, FileText, Clock, Inbox } from "lucide-react";
import { format as formatDate } from "date-fns";
import { de } from "date-fns/locale";

interface SubmittedTopsSectionProps {
  meetingId: string;
  buildingId: string;
}

export const SubmittedTopsSection = ({ meetingId, buildingId }: SubmittedTopsSectionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data: pendingTops = [], isLoading } = useQuery({
    queryKey: ["submitted-tops-pending", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_submitted_tops")
        .select("*, profiles!etv_submitted_tops_submitted_by_user_id_fkey(first_name, last_name)")
        .eq("building_id", buildingId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Get current max sort_order for agenda items
  const { data: agendaItems = [] } = useQuery({
    queryKey: ["etv-agenda-items", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_agenda_items")
        .select("sort_order")
        .eq("meeting_id", meetingId)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data || [];
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (top: any) => {
      const nextOrder = (agendaItems[0]?.sort_order || 0) + 1;
      
      // Create agenda item from submitted TOP
      const { error: insertErr } = await supabase.from("etv_agenda_items").insert({
        meeting_id: meetingId,
        title: top.title,
        description: top.description,
        sort_order: nextOrder,
        voting_principle: "mea",
        category: "sonstiges",
        attachment_paths: top.attachment_paths,
      });
      if (insertErr) throw insertErr;

      // Update submitted TOP status
      const { error: updateErr } = await supabase
        .from("etv_submitted_tops")
        .update({ status: "accepted", accepted_into_meeting_id: meetingId, updated_at: new Date().toISOString() })
        .eq("id", top.id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      toast({ title: "TOP übernommen" });
      queryClient.invalidateQueries({ queryKey: ["submitted-tops-pending", buildingId] });
      queryClient.invalidateQueries({ queryKey: ["etv-agenda-items", meetingId] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note?: string }) => {
      const { error } = await supabase
        .from("etv_submitted_tops")
        .update({ 
          status, 
          admin_notes: note || null, 
          updated_at: new Date().toISOString() 
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Status aktualisiert" });
      setRejectId(null);
      setRejectNote("");
      queryClient.invalidateQueries({ queryKey: ["submitted-tops-pending", buildingId] });
    },
  });

  if (isLoading) return null;
  if (pendingTops.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-amber-500" />
        <h4 className="text-sm font-semibold text-foreground">
          Eingereichte Anträge ({pendingTops.length})
        </h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Eigentümer haben folgende TOPs zur Aufnahme in die Tagesordnung eingereicht.
      </p>

      {pendingTops.map((top: any) => {
        const submitter = top.profiles;
        const name = submitter ? `${submitter.first_name || ""} ${submitter.last_name || ""}`.trim() : "Unbekannt";
        return (
          <Card key={top.id} className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h5 className="font-semibold text-sm">{top.title}</h5>
                  {top.description && (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{top.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
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
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-1 h-8"
                    onClick={() => acceptMutation.mutate(top)}
                    disabled={acceptMutation.isPending}
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
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Reject dialog with optional note */}
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
