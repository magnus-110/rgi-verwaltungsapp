import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Loader2, Maximize2, FileText, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { ProtocolSignaturesInline } from "./ProtocolSignaturesInline";
import { ProtocolDownloadButtons } from "./ProtocolDownloadButtons";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface MeetingProtocolProps {
  meetingId: string;
  buildingId: string;
}

export const MeetingProtocol = ({ meetingId, buildingId }: MeetingProtocolProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fullscreen, setFullscreen] = useState(false);

  const { data: meeting } = useQuery({
    queryKey: ["etv-meeting-protocol", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_meetings")
        .select("*, buildings(name, address, manager_name)")
        .eq("id", meetingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: agendaItems = [] } = useQuery({
    queryKey: ["etv-agenda-protocol", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_agenda_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const protocolText = meeting?.protocol_text || "";
  const hasProtocol = !!protocolText;
  const votedItems = agendaItems.filter((i: any) => i.status === "voted");
  const totalItems = agendaItems.length;
  const allVoted = totalItems > 0 && votedItems.length === totalItems;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-meeting-protocol", { body: { meetingId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.protocol as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-meeting-protocol", meetingId] });
      toast({ title: "Protokoll generiert" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const saveResolutionsMutation = useMutation({
    mutationFn: async () => {
      const items = agendaItems.filter((i: any) => i.status === "voted" && i.resolution_text);
      const resolutions = items.map((item: any, idx: number) => ({
        meeting_id: meetingId,
        agenda_item_id: item.id,
        building_id: buildingId,
        resolution_number: `${new Date(meeting?.meeting_date).getFullYear()}-${idx + 1}`,
        resolution_text: item.resolution_text,
        result: item.result || "failed",
        yes_count: item.yes_count || 0,
        no_count: item.no_count || 0,
        abstain_count: item.abstain_count || 0,
        voting_principle: item.voting_principle,
        resolved_at: meeting?.meeting_date,
        published: false,
      }));
      if (resolutions.length === 0) return 0;
      await supabase.from("etv_resolutions").delete().eq("meeting_id", meetingId);
      const { error } = await supabase.from("etv_resolutions").insert(resolutions);
      if (error) throw error;
      return resolutions.length;
    },
    onSuccess: (count) => toast({ title: "Beschlusssammlung aktualisiert", description: `${count} Beschlüsse gespeichert.` }),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("etv_meetings").update({ protocol_published: true }).eq("id", meetingId);
      if (error) throw error;
      const { error: resError } = await supabase.from("etv_resolutions").update({ published: true }).eq("meeting_id", meetingId);
      if (resError) throw resError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-meeting-protocol", meetingId] });
      toast({ title: "Veröffentlicht", description: "Protokoll und Beschlüsse sind im Eigentümer-Portal sichtbar." });
    },
  });

  const generateProtocolHtml = () => {
    const building = meeting?.buildings as any;
    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 25mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.7; color: #1a1a1a; max-width: 170mm; margin: 0 auto; padding: 24px; }
    .header { text-align: center; border-bottom: 2px solid #ea580c; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 16pt; margin: 0 0 4px; color: #ea580c; }
    .header p { margin: 2px 0; font-size: 10pt; color: #555; }
    .protocol-body { white-space: pre-wrap; font-size: 11pt; line-height: 1.8; }
    .footer { margin-top: 60px; border-top: 1px solid #ddd; padding-top: 16px; font-size: 9pt; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Protokoll der Eigentümerversammlung</h1>
    <p>${building?.name || ""} — ${building?.address || ""}</p>
    <p>${meeting?.meeting_date ? format(new Date(meeting.meeting_date), "dd. MMMM yyyy", { locale: de }) : ""}</p>
  </div>
  <div class="protocol-body">${protocolText}</div>
  <div class="footer">Erstellt am ${format(new Date(), "dd.MM.yyyy", { locale: de })} | ${building?.manager_name || "Hausverwaltung"}</div>
</body>
</html>`;
  };

  if (!hasProtocol) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm mb-1">Noch kein Protokoll erstellt.</p>
          <p className="text-xs mb-4">
            {!allVoted ? "Schließen Sie erst alle Abstimmungen ab." : "Klicken Sie auf „Protokoll generieren\u201C."}
          </p>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || totalItems === 0}
            className="gap-2"
          >
            {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            KI-Protokoll generieren
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mini Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5">
            {allVoted ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
            {votedItems.length} / {totalItems} TOPs
          </span>
          {meeting?.protocol_generated_at && (
            <span>Generiert: {format(new Date(meeting.protocol_generated_at), "dd.MM.yyyy HH:mm", { locale: de })}</span>
          )}
          {meeting?.protocol_published && <Badge className="h-5 text-[10px]">✓ Veröffentlicht</Badge>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setFullscreen(true)} className="gap-1.5 h-7">
          <Maximize2 className="h-3.5 w-3.5" /> Vollbild
        </Button>
      </div>

      {/* Protokoll-Vorschau */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <iframe
          srcDoc={generateProtocolHtml()}
          className="w-full bg-white"
          style={{ height: 600, border: 0 }}
          title="Protokoll-Vorschau"
        />
      </div>

      {/* Unterschriften */}
      <ProtocolSignaturesInline meetingId={meetingId} />

      {/* Primäre Aktionen */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <ProtocolDownloadButtons meetingId={meetingId} />
        <Button
          onClick={() => saveResolutionsMutation.mutate()}
          disabled={saveResolutionsMutation.isPending || votedItems.length === 0}
          variant="outline"
          className="gap-2"
        >
          {saveResolutionsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Beschlusssammlung aktualisieren
        </Button>
      </div>

      {/* Sekundär */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          variant="ghost" size="sm" className="gap-2 text-xs"
        >
          {generateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Protokoll neu generieren
        </Button>
        <Button
          onClick={() => publishMutation.mutate()}
          disabled={publishMutation.isPending || meeting?.protocol_published}
          variant="ghost" size="sm" className="gap-2 text-xs"
        >
          <Send className="h-3.5 w-3.5" />
          {meeting?.protocol_published ? "Veröffentlicht ✓" : "Im Portal veröffentlichen"}
        </Button>
      </div>

      {/* Vollbild Dialog */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-6xl h-[95dvh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>Protokoll-Vorschau</DialogTitle>
          </DialogHeader>
          <iframe srcDoc={generateProtocolHtml()} className="w-full flex-1 min-h-0 border-t bg-white" title="Protokoll Vollbild" />
        </DialogContent>
      </Dialog>
    </div>
  );
};
