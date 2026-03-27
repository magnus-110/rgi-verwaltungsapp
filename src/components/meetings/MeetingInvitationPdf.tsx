import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Download, Eye, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface MeetingInvitationPdfProps {
  meetingId: string;
  buildingId: string;
}

export const MeetingInvitationPdf = ({ meetingId, buildingId }: MeetingInvitationPdfProps) => {
  const { toast } = useToast();
  const [showEditor, setShowEditor] = useState(false);
  const [greeting, setGreeting] = useState(
    "Sehr geehrte Eigentümerinnen und Eigentümer,\n\nhiermit laden wir Sie herzlich zur ordentlichen Eigentümerversammlung ein. Nachfolgend finden Sie die Tagesordnung:"
  );
  const [closingText, setClosingText] = useState(
    "Sollten Sie an der Versammlung nicht teilnehmen können, bitten wir Sie, eine Vollmacht zu erteilen. Ein entsprechendes Formular liegt diesem Schreiben bei.\n\nMit freundlichen Grüßen"
  );
  const [additionalNotes, setAdditionalNotes] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

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

  const building = meeting?.buildings as any;
  const dateStr = meeting ? format(new Date(meeting.meeting_date), "dd. MMMM yyyy", { locale: de }) : "";
  const timeStr = meeting ? format(new Date(meeting.meeting_date), "HH:mm", { locale: de }) : "";

  const handleDownloadPdf = async () => {
    if (!meeting || !previewRef.current) return;

    try {
      // Render the preview HTML to canvas
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        width: previewRef.current.scrollWidth,
        height: previewRef.current.scrollHeight,
        windowWidth: previewRef.current.scrollWidth,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      // Handle multi-page if content is taller than one A4 page
      if (imgHeight <= pdfHeight) {
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      } else {
        let remainingHeight = imgHeight;
        let position = 0;

        while (remainingHeight > 0) {
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          remainingHeight -= pdfHeight;
          position -= pdfHeight;
          if (remainingHeight > 0) {
            pdf.addPage();
          }
        }
      }

      pdf.save(`Einladung_ETV_${meeting?.title?.replace(/\s+/g, "_") || "Versammlung"}.pdf`);
      toast({ title: "PDF heruntergeladen", description: "Die Einladung wurde als PDF gespeichert." });
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast({ title: "Fehler", description: "PDF konnte nicht erstellt werden.", variant: "destructive" });
    }
  };

  const loadImageAsDataUrl = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) { reject(new Error("no canvas ctx")); return; }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Erstellen Sie eine druckfertige Einladung mit allen Tagesordnungspunkten.
        {agendaItems.length === 0 && " Bitte fügen Sie zuerst TOPs hinzu."}
      </p>

      <div className="flex gap-3">
        <Button
          onClick={() => setShowEditor(true)}
          disabled={agendaItems.length === 0}
          variant="outline"
          className="gap-2"
        >
          <Eye className="h-4 w-4" />
          Vorschau & Bearbeiten
        </Button>
        <Button
          onClick={handleDownloadPdf}
          disabled={agendaItems.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Als PDF herunterladen
        </Button>
      </div>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Einladung bearbeiten
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
            {/* Editor side */}
            <div className="space-y-4 overflow-y-auto pr-2">
              <div className="space-y-2">
                <Label>Begrüßungstext</Label>
                <Textarea
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  rows={5}
                  className="text-sm"
                />
              </div>

              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Tagesordnung (aus TOPs generiert)</p>
                {agendaItems.map((item: any, idx: number) => (
                  <div key={item.id} className="text-sm mb-2 border-l-2 border-[hsl(var(--primary))] pl-2">
                    <span className="font-semibold text-[hsl(var(--primary))]">TOP {idx + 1}</span>{" "}
                    <span className="font-medium">{item.title}</span>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Zusätzliche Hinweise (optional)</Label>
                <Textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  rows={3}
                  placeholder="z.B. Parkhinweise, Bewirtung..."
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>Schlusstext</Label>
                <Textarea
                  value={closingText}
                  onChange={(e) => setClosingText(e.target.value)}
                  rows={4}
                  className="text-sm"
                />
              </div>

              <Button onClick={handleDownloadPdf} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Als PDF herunterladen
              </Button>
            </div>

            {/* Live preview side */}
            <div className="border rounded-lg bg-white overflow-y-auto shadow-sm">
              <div className="p-8 text-[11px] leading-relaxed" ref={previewRef} style={{ fontFamily: "'Work Sans', sans-serif", color: "#4a4849", width: "794px", maxWidth: "794px", background: "#fff" }}>
                {/* Logo top right */}
                <div className="flex justify-end mb-3">
                  <img
                    src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png"
                    alt="Logo"
                    className="h-14 object-contain"
                  />
                </div>
                {/* Header below logo */}
                <div className="pb-2 mb-4 border-b-2" style={{ borderColor: "#ee7202" }}>
                  <h1 className="text-[18px] font-bold m-0" style={{ color: "#4a4849", fontFamily: "'Century Gothic', Arial, sans-serif" }}>
                    Einladung zur Eigentümerversammlung
                  </h1>
                  <p className="text-[11px] mt-1" style={{ color: "#999" }}>{building?.name || ""}</p>
                </div>

                {/* Meta */}
                <div className="mb-4 text-[11px]">
                  <div className="flex mb-1"><span className="font-semibold w-24">Liegenschaft:</span><span>{building?.name}, {building?.address}</span></div>
                  <div className="flex mb-1"><span className="font-semibold w-24">Datum:</span><span>{dateStr}</span></div>
                  <div className="flex mb-1"><span className="font-semibold w-24">Uhrzeit:</span><span>{timeStr} Uhr</span></div>
                  {meeting?.location && <div className="flex mb-1"><span className="font-semibold w-24">Ort:</span><span>{meeting.location}</span></div>}
                </div>

                {/* Greeting */}
                <div className="mb-4 whitespace-pre-line text-[11px]">{greeting}</div>

                {/* Agenda */}
                <h2 className="text-[13px] font-bold mb-1 pb-1 border-b" style={{ color: "#4a4849", fontFamily: "'Century Gothic', Arial, sans-serif" }}>Tagesordnung</h2>
                <div className="mt-3 space-y-2">
                  {agendaItems.map((item: any, idx: number) => (
                    <div key={item.id} className="p-2 rounded" style={{ background: "#faf8f5", borderLeft: "3px solid #ee7202" }}>
                      <div>
                        <span className="font-bold text-[10px]" style={{ color: "#ee7202" }}>TOP {idx + 1}</span>
                        <span className="font-semibold ml-2 text-[11px]">{item.title}</span>
                      </div>
                      {item.description && <p className="text-[10px] mt-0.5" style={{ color: "#666" }}>{item.description}</p>}
                    </div>
                  ))}
                </div>

                {/* Additional notes */}
                {additionalNotes.trim() && (
                  <div className="mt-4 whitespace-pre-line text-[11px]">{additionalNotes}</div>
                )}

                {/* Closing */}
                <div className="mt-5 whitespace-pre-line text-[11px]">{closingText}</div>
                <p className="font-bold mt-3 text-[11px]">RGI Immobilien GmbH &amp; Co. KG</p>

                {/* Footer */}
                <div className="mt-8 pt-3 border-t text-center text-[9px]" style={{ borderColor: "#ee7202", color: "#999" }}>
                  RGI Immobilien GmbH &amp; Co. KG
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
