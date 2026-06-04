import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Loader2, Eye, Download, FileText, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { ProtocolRenderActions } from "./ProtocolRenderActions";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface MeetingProtocolProps {
  meetingId: string;
  buildingId: string;
}

export const MeetingProtocol = ({ meetingId, buildingId }: MeetingProtocolProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);

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

  const { data: attendees = [] } = useQuery({
    queryKey: ["etv-attendees-protocol", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etv_attendees")
        .select(`
          *,
          contact_building_assignments!inner(
            unit_number,
            contacts!inner(first_name, last_name, company_name)
          )
        `)
        .eq("meeting_id", meetingId);
      if (error) throw error;
      return data || [];
    },
  });

  const protocolText = meeting?.protocol_text || "";
  const hasProtocol = !!protocolText;

  // Check readiness
  const votedItems = agendaItems.filter((i: any) => i.status === "voted");
  const totalItems = agendaItems.length;
  const allVoted = totalItems > 0 && votedItems.length === totalItems;
  const hasNotesOrResolutions = agendaItems.some((i: any) => i.admin_notes || i.resolution_text);

  // Generate protocol via dedicated edge function
  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-meeting-protocol", {
        body: { meetingId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.protocol as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-meeting-protocol", meetingId] });
      toast({ title: "Protokoll generiert", description: "Das Protokoll wurde aus den Versammlungsdaten erstellt." });
    },
    onError: (err: any) => {
      toast({ title: "Fehler bei der Protokollerstellung", description: err.message, variant: "destructive" });
    },
  });

  // Save resolutions to Beschlusssammlung
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
    onSuccess: (count) => {
      toast({ title: "Beschlusssammlung aktualisiert", description: `${count} Beschlüsse gespeichert.` });
    },
  });

  // Publish protocol
  const publishMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("etv_meetings")
        .update({ protocol_published: true })
        .eq("id", meetingId);
      if (error) throw error;
      const { error: resError } = await supabase
        .from("etv_resolutions")
        .update({ published: true })
        .eq("meeting_id", meetingId);
      if (resError) throw resError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-meeting-protocol", meetingId] });
      toast({ title: "Veröffentlicht", description: "Protokoll und Beschlüsse sind jetzt im Eigentümer-Portal sichtbar." });
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
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.7; color: #1a1a1a; max-width: 170mm; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #1e40af; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 16pt; margin: 0 0 4px; color: #1e40af; }
    .header p { margin: 2px 0; font-size: 10pt; color: #555; }
    .protocol-body { white-space: pre-wrap; font-size: 11pt; line-height: 1.8; }
    .footer { margin-top: 60px; border-top: 1px solid #ddd; padding-top: 16px; font-size: 9pt; color: #888; }
    .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
    .sig-line { width: 200px; border-top: 1px solid #333; padding-top: 4px; font-size: 9pt; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Protokoll der Eigentümerversammlung</h1>
    <p>${building?.name || ""} — ${building?.address || ""}</p>
    <p>${meeting?.meeting_date ? format(new Date(meeting.meeting_date), "dd. MMMM yyyy", { locale: de }) : ""}</p>
  </div>
  <div class="protocol-body">${protocolText}</div>
  <div class="signatures">
    <div class="sig-line">Versammlungsleiter</div>
    <div class="sig-line">Protokollführer</div>
  </div>
  <div class="footer">
    Erstellt am ${format(new Date(), "dd.MM.yyyy", { locale: de })} | ${building?.manager_name || "Hausverwaltung"}
  </div>
</body>
</html>`;
  };

  const handleDownload = () => {
    const html = generateProtocolHtml();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Protokoll_${meeting?.title?.replace(/\s+/g, "_") || "ETV"}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Protokoll heruntergeladen" });
  };

  return (
    <div className="space-y-4">
      {/* Status overview */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <div className="flex items-center gap-2">
              {allVoted ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              )}
              <span>{votedItems.length} / {totalItems} TOPs abgestimmt</span>
            </div>
            {hasProtocol && (
              <Badge variant="outline" className="text-xs">
                Protokoll generiert: {meeting?.protocol_generated_at
                  ? format(new Date(meeting.protocol_generated_at), "dd.MM.yyyy HH:mm", { locale: de })
                  : ""}
              </Badge>
            )}
            {meeting?.protocol_published && (
              <Badge className="text-xs">✓ Veröffentlicht</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending || totalItems === 0}
          variant="outline"
          className="gap-2"
        >
          {generateMutation.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Protokoll wird erstellt...</>
          ) : (
            <><Sparkles className="h-4 w-4" /> {hasProtocol ? "Protokoll neu generieren" : "KI-Protokoll generieren"}</>
          )}
        </Button>
        <Button
          onClick={() => saveResolutionsMutation.mutate()}
          disabled={saveResolutionsMutation.isPending || votedItems.length === 0}
          variant="outline"
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Beschlusssammlung aktualisieren
        </Button>
      </div>

      {/* Protocol display */}
      {hasProtocol ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Generiertes Protokoll</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap text-sm leading-relaxed border rounded-md p-4 bg-muted/30 max-h-[500px] overflow-y-auto">
              {protocolText}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Noch kein Protokoll erstellt.</p>
            <p className="text-xs mt-1">
              {!allVoted
                ? "Schließen Sie erst alle Abstimmungen ab, dann kann das Protokoll automatisch generiert werden."
                : "Klicken Sie auf \"KI-Protokoll generieren\" um das Protokoll aus allen Versammlungsdaten zu erstellen."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Save / Preview / Download / Publish */}
      {hasProtocol && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setShowPreview(true)}
            variant="outline"
            className="gap-2"
          >
            <Eye className="h-4 w-4" /> Vorschau
          </Button>
          <Button
            onClick={handleDownload}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" /> Als HTML
          </Button>
          <Button
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || meeting?.protocol_published}
            variant={meeting?.protocol_published ? "secondary" : "default"}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {meeting?.protocol_published ? "Veröffentlicht ✓" : "Im Portal veröffentlichen"}
          </Button>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl h-[85dvh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Protokoll-Vorschau</DialogTitle>
          </DialogHeader>
          <iframe
            srcDoc={generateProtocolHtml()}
            className="w-full flex-1 min-h-0 border rounded-md"
            title="Protokollvorschau"
          />
        </DialogContent>

      </Dialog>
    </div>
  );
};
