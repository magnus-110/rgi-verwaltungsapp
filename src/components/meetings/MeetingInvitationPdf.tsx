import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Download, Loader2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface MeetingInvitationPdfProps {
  meetingId: string;
  buildingId: string;
}

export const MeetingInvitationPdf = ({ meetingId, buildingId }: MeetingInvitationPdfProps) => {
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);

  const { data: meeting } = useQuery({
    queryKey: ["etv-meeting-detail", meetingId],
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
    queryKey: ["etv-agenda-items", meetingId],
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

  const generateHtml = () => {
    if (!meeting) return "";
    const building = meeting.buildings as any;
    const dateStr = format(new Date(meeting.meeting_date), "dd. MMMM yyyy", { locale: de });
    const timeStr = format(new Date(meeting.meeting_date), "HH:mm", { locale: de });

    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 25mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; max-width: 170mm; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 18pt; margin: 0 0 4px; color: #1e40af; }
    .header p { margin: 2px 0; font-size: 10pt; color: #555; }
    .meta { margin-bottom: 24px; }
    .meta-row { display: flex; margin-bottom: 6px; }
    .meta-label { font-weight: 600; width: 120px; color: #374151; }
    .meta-value { color: #1a1a1a; }
    .greeting { margin-bottom: 20px; }
    h2 { font-size: 13pt; color: #1e40af; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-top: 24px; }
    .agenda-item { margin-bottom: 16px; padding: 10px 12px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #2563eb; }
    .agenda-item .top-number { font-weight: 700; color: #1e40af; font-size: 10pt; }
    .agenda-item .top-title { font-weight: 600; margin-left: 8px; }
    .agenda-item .top-desc { font-size: 10pt; color: #555; margin-top: 4px; }
    .agenda-item .resolution { font-size: 10pt; margin-top: 6px; padding: 8px; background: #fff; border: 1px solid #e5e7eb; border-radius: 4px; font-style: italic; }
    .agenda-item .voting-badge { display: inline-block; font-size: 8pt; background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 3px; margin-top: 4px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 9pt; color: #888; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Einladung zur Eigentümerversammlung</h1>
    <p>${building?.name || ""}</p>
  </div>

  <div class="meta">
    <div class="meta-row"><span class="meta-label">Liegenschaft:</span><span class="meta-value">${building?.name || ""}, ${building?.address || ""}</span></div>
    <div class="meta-row"><span class="meta-label">Datum:</span><span class="meta-value">${dateStr}</span></div>
    <div class="meta-row"><span class="meta-label">Uhrzeit:</span><span class="meta-value">${timeStr} Uhr</span></div>
    ${meeting.location ? `<div class="meta-row"><span class="meta-label">Ort:</span><span class="meta-value">${meeting.location}</span></div>` : ""}
    ${building?.manager_name ? `<div class="meta-row"><span class="meta-label">Verwalter:</span><span class="meta-value">${building.manager_name}</span></div>` : ""}
  </div>

  <div class="greeting">
    <p>Sehr geehrte Eigentümerinnen und Eigentümer,</p>
    <p>hiermit laden wir Sie herzlich zur ordentlichen Eigentümerversammlung ein. Nachfolgend finden Sie die Tagesordnung:</p>
  </div>

  <h2>Tagesordnung</h2>

  ${agendaItems.map((item: any, idx: number) => `
    <div class="agenda-item">
      <div>
        <span class="top-number">TOP ${idx + 1}</span>
        <span class="top-title">${item.title}</span>
      </div>
      ${item.description ? `<div class="top-desc">${item.description}</div>` : ""}
      ${item.resolution_text ? `<div class="resolution">Beschlussvorschlag: ${item.resolution_text}</div>` : ""}
      <div class="voting-badge">${
        item.voting_principle === "mea" ? "Abstimmung nach MEA" :
        item.voting_principle === "headcount" ? "Abstimmung nach Köpfen" :
        "Doppelt qualifizierte Mehrheit"
      }</div>
    </div>
  `).join("")}

  <div class="footer">
    <p>Erstellt am ${format(new Date(), "dd.MM.yyyy", { locale: de })} | ${building?.manager_name || "Hausverwaltung"}</p>
  </div>
</body>
</html>`;
  };

  const handleDownload = () => {
    const html = generateHtml();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Einladung_ETV_${meeting?.title?.replace(/\s+/g, "_") || "Versammlung"}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Einladung heruntergeladen", description: "Öffnen Sie die HTML-Datei und drucken Sie sie als PDF." });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Erstellen Sie eine druckfertige Einladung mit allen Tagesordnungspunkten.
        {agendaItems.length === 0 && " Bitte fügen Sie zuerst TOPs hinzu."}
      </p>

      <div className="flex gap-3">
        <Button
          onClick={() => setShowPreview(true)}
          disabled={agendaItems.length === 0}
          variant="outline"
          className="gap-2"
        >
          <Eye className="h-4 w-4" />
          Vorschau
        </Button>
        <Button
          onClick={handleDownload}
          disabled={agendaItems.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Als HTML herunterladen
        </Button>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl h-[85vh]">
          <DialogHeader>
            <DialogTitle>Einladungs-Vorschau</DialogTitle>
          </DialogHeader>
          <iframe
            srcDoc={generateHtml()}
            className="w-full flex-1 border rounded-md"
            style={{ height: "calc(85vh - 80px)" }}
            title="Einladungsvorschau"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
