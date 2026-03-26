import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Loader2, Save, Eye, Download, FileText, Send } from "lucide-react";
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
  const [isGenerating, setIsGenerating] = useState(false);

  // Load meeting with protocol
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

  // Load agenda items with results
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

  // Load attendees
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

  const [protocolText, setProtocolText] = useState(meeting?.protocol_text || "");

  // Sync when meeting loads
  useState(() => {
    if (meeting?.protocol_text && !protocolText) {
      setProtocolText(meeting.protocol_text);
    }
  });

  // Generate protocol via AI
  const handleGenerateProtocol = async () => {
    setIsGenerating(true);
    try {
      const building = meeting?.buildings as any;
      const presentAttendees = attendees.filter((a: any) => a.attendance_type !== "absent");
      const attendeeNames = presentAttendees.map((a: any) => {
        const c = a.contact_building_assignments?.contacts;
        return c?.company_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ");
      });

      const agendaSummary = agendaItems.map((item: any, idx: number) => {
        const resultText = item.result === "passed" ? "ANGENOMMEN" : item.result === "failed" ? "ABGELEHNT" : "Offen";
        return `TOP ${idx + 1}: ${item.title}
Beschlusstext: ${item.resolution_text || "Kein Beschlusstext"}
Ergebnis: ${resultText} (Ja: ${item.yes_count}, Nein: ${item.no_count}, Enthaltung: ${item.abstain_count})
Admin-Notizen: ${item.admin_notes || "Keine"}`;
      }).join("\n\n");

      const prompt = `Erstelle ein formelles Versammlungsprotokoll für eine WEG-Eigentümerversammlung nach deutschem Recht. Nutze die folgenden Daten:

Versammlung: ${meeting?.title}
Datum: ${meeting?.meeting_date ? format(new Date(meeting.meeting_date), "dd.MM.yyyy, HH:mm 'Uhr'", { locale: de }) : ""}
Ort: ${meeting?.location || "Nicht angegeben"}
Liegenschaft: ${building?.name}, ${building?.address}
Verwalter: ${building?.manager_name || "Nicht angegeben"}

Anwesende (${presentAttendees.length} von ${attendees.length}):
${attendeeNames.join(", ")}

Tagesordnung und Ergebnisse:
${agendaSummary}

Erstelle ein vollständiges, rechtssicheres Protokoll mit:
1. Kopf mit allen Versammlungsdaten
2. Feststellung der Beschlussfähigkeit
3. Für jeden TOP: Zusammenfassung der Diskussion, Beschlusstext und Abstimmungsergebnis
4. Schlussteil mit Unterschriftszeilen

Formatiere als sauberen Fließtext mit Absätzen. Antworte NUR mit dem Protokolltext.`;

      const { data, error } = await supabase.functions.invoke("chat-with-ai", {
        body: {
          message: prompt,
          buildingId,
          managementMode: "weg",
        },
      });

      if (error) throw error;
      const generated = data?.response || data?.message || "";
      setProtocolText(generated);
      toast({ title: "Protokoll generiert", description: "Bitte prüfen und ggf. anpassen." });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  // Save protocol
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("etv_meetings")
        .update({
          protocol_text: protocolText,
          protocol_generated_at: new Date().toISOString(),
        })
        .eq("id", meetingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["etv-meeting-protocol", meetingId] });
      toast({ title: "Protokoll gespeichert" });
    },
  });

  // Save resolutions to Beschlusssammlung
  const saveResolutionsMutation = useMutation({
    mutationFn: async () => {
      const votedItems = agendaItems.filter((i: any) => i.status === "voted" && i.resolution_text);
      const resolutions = votedItems.map((item: any, idx: number) => ({
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

      // Delete existing resolutions for this meeting first
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

      // Also publish resolutions
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

  // Generate protocol HTML for preview
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
  <div class="protocol-body">${protocolText || "Noch kein Protokoll erstellt."}</div>
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
      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleGenerateProtocol}
          disabled={isGenerating || agendaItems.length === 0}
          variant="outline"
          className="gap-2"
        >
          {isGenerating ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generiere...</>
          ) : (
            <><Sparkles className="h-4 w-4" /> KI-Protokoll generieren</>
          )}
        </Button>
        <Button
          onClick={() => saveResolutionsMutation.mutate()}
          disabled={saveResolutionsMutation.isPending}
          variant="outline"
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Beschlusssammlung aktualisieren
        </Button>
      </div>

      {/* Protocol editor */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Protokolltext</span>
            {meeting?.protocol_generated_at && (
              <Badge variant="outline" className="text-xs font-normal">
                Generiert: {format(new Date(meeting.protocol_generated_at), "dd.MM.yyyy HH:mm", { locale: de })}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={protocolText}
            onChange={(e) => setProtocolText(e.target.value)}
            placeholder="Protokoll hier eingeben oder per KI generieren lassen..."
            rows={16}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Save / Preview / Download / Publish */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !protocolText}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          Speichern
        </Button>
        <Button
          onClick={() => setShowPreview(true)}
          disabled={!protocolText}
          variant="outline"
          className="gap-2"
        >
          <Eye className="h-4 w-4" />
          Vorschau
        </Button>
        <Button
          onClick={handleDownload}
          disabled={!protocolText}
          variant="outline"
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Als HTML
        </Button>
        <Button
          onClick={() => publishMutation.mutate()}
          disabled={publishMutation.isPending || !protocolText || meeting?.protocol_published}
          variant={meeting?.protocol_published ? "secondary" : "default"}
          className="gap-2"
        >
          <Send className="h-4 w-4" />
          {meeting?.protocol_published ? "Veröffentlicht ✓" : "Im Portal veröffentlichen"}
        </Button>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl h-[85vh]">
          <DialogHeader>
            <DialogTitle>Protokoll-Vorschau</DialogTitle>
          </DialogHeader>
          <iframe
            srcDoc={generateProtocolHtml()}
            className="w-full flex-1 border rounded-md"
            style={{ height: "calc(85vh - 80px)" }}
            title="Protokollvorschau"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
