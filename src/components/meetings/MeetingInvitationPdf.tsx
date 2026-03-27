import { useState, useRef, useEffect, useCallback } from "react";
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

const LOGO_URL = "/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png";

// A4 preview content as a standalone component so it can be reused
const A4Preview = ({
  innerRef,
  logoBase64,
  building,
  dateStr,
  timeStr,
  meeting,
  greeting,
  agendaItems,
  additionalNotes,
  closingText,
}: {
  innerRef?: React.Ref<HTMLDivElement>;
  logoBase64: string | null;
  building: any;
  dateStr: string;
  timeStr: string;
  meeting: any;
  greeting: string;
  agendaItems: any[];
  additionalNotes: string;
  closingText: string;
}) => (
  <div
    ref={innerRef}
    style={{
      fontFamily: "'Work Sans', sans-serif",
      color: "#4a4849",
      width: "794px",
      minHeight: "1123px",
      background: "#fff",
      padding: "72px 68px",
      boxSizing: "border-box",
      fontSize: "15px",
      lineHeight: "1.5",
    }}
  >
    {/* Logo top right */}
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "32px" }}>
      {logoBase64 ? (
        <img src={logoBase64} alt="Logo" style={{ height: "48px", objectFit: "contain" }} />
      ) : (
        <img
          src={`${window.location.origin}${LOGO_URL}`}
          alt="Logo"
          style={{ height: "48px", objectFit: "contain" }}
          crossOrigin="anonymous"
        />
      )}
    </div>

    {/* Header */}
    <div style={{ paddingBottom: "10px", marginBottom: "28px", borderBottom: "2px solid #ee7202" }}>
      <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: 0, color: "#4a4849", fontFamily: "'Century Gothic', Arial, sans-serif" }}>
        Einladung zur Eigentümerversammlung
      </h1>
      <p style={{ fontSize: "11px", marginTop: "4px", color: "#999" }}>{building?.name || ""}</p>
    </div>

    {/* Meta */}
    <div style={{ marginBottom: "28px", fontSize: "13px" }}>
      <div style={{ display: "flex", marginBottom: "5px" }}>
        <span style={{ fontWeight: 600, width: "110px", flexShrink: 0 }}>Liegenschaft:</span>
        <span>{building?.name}, {building?.address}</span>
      </div>
      <div style={{ display: "flex", marginBottom: "5px" }}>
        <span style={{ fontWeight: 600, width: "110px", flexShrink: 0 }}>Datum:</span>
        <span>{dateStr}</span>
      </div>
      <div style={{ display: "flex", marginBottom: "5px" }}>
        <span style={{ fontWeight: 600, width: "110px", flexShrink: 0 }}>Uhrzeit:</span>
        <span>{timeStr} Uhr</span>
      </div>
      {meeting?.location && (
        <div style={{ display: "flex", marginBottom: "5px" }}>
          <span style={{ fontWeight: 600, width: "110px", flexShrink: 0 }}>Ort:</span>
          <span>{meeting.location}</span>
        </div>
      )}
    </div>

    {/* Greeting */}
    <div style={{ marginBottom: "28px", whiteSpace: "pre-line", fontSize: "13px" }}>{greeting}</div>

    {/* Agenda */}
    <h2 style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid #ddd", color: "#4a4849", fontFamily: "'Century Gothic', Arial, sans-serif" }}>
      Tagesordnung
    </h2>
    <div style={{ marginTop: "14px" }}>
      {agendaItems.map((item: any, idx: number) => (
        <div key={item.id} style={{ padding: "10px 12px", borderRadius: "4px", background: "#faf8f5", borderLeft: "3px solid #ee7202", marginBottom: "12px" }}>
          <div>
            <span style={{ fontWeight: "bold", fontSize: "11px", color: "#ee7202" }}>TOP {idx + 1}</span>
            <span style={{ fontWeight: 600, marginLeft: "10px", fontSize: "13px" }}>{item.title}</span>
          </div>
          {item.description && <p style={{ fontSize: "11px", marginTop: "3px", color: "#666" }}>{item.description}</p>}
        </div>
      ))}
    </div>

    {/* Additional notes */}
    {additionalNotes.trim() && (
      <div style={{ marginTop: "24px", whiteSpace: "pre-line", fontSize: "13px" }}>{additionalNotes}</div>
    )}

    {/* Closing */}
    <div style={{ marginTop: "32px", whiteSpace: "pre-line", fontSize: "13px" }}>{closingText}</div>
    <p style={{ fontWeight: "bold", marginTop: "14px", fontSize: "13px" }}>RGI Immobilien GmbH &amp; Co. KG</p>

    {/* Footer */}
    <div style={{ marginTop: "56px", paddingTop: "12px", borderTop: "1px solid #ee7202", textAlign: "center", fontSize: "10px", color: "#999" }}>
      RGI Immobilien GmbH &amp; Co. KG
    </div>
  </div>
);

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
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const offscreenRef = useRef<HTMLDivElement>(null);

  // Preload logo as Base64 to avoid html2canvas CORS issues
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setLogoBase64(canvas.toDataURL("image/png"));
      }
    };
    img.onerror = () => console.warn("Logo could not be loaded for PDF");
    img.src = `${window.location.origin}${LOGO_URL}`;
  }, []);

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

  const previewProps = {
    logoBase64,
    building,
    dateStr,
    timeStr,
    meeting,
    greeting,
    agendaItems,
    additionalNotes,
    closingText,
  };

  const handleDownloadPdf = useCallback(async () => {
    if (!meeting) return;

    const target = offscreenRef.current;
    if (!target) return;

    try {
      const canvas = await html2canvas(target, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        width: 794,
        height: target.scrollHeight,
        windowWidth: 794,
        scrollX: 0,
        scrollY: 0,
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      if (imgHeight <= pdfHeight) {
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, imgHeight);
      } else {
        // Slice canvas into pages to avoid content overlap
        const pageHeightPx = (pdfHeight / pdfWidth) * canvas.width;
        const totalPages = Math.ceil(canvas.height / pageHeightPx);

        for (let i = 0; i < totalPages; i++) {
          if (i > 0) pdf.addPage();

          const sliceHeight = Math.min(pageHeightPx, canvas.height - i * pageHeightPx);
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceHeight;
          const ctx = pageCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(
              canvas,
              0, i * pageHeightPx, canvas.width, sliceHeight,
              0, 0, canvas.width, sliceHeight
            );
            const pageImgData = pageCanvas.toDataURL("image/png");
            const sliceHeightMm = (sliceHeight * pdfWidth) / canvas.width;
            pdf.addImage(pageImgData, "PNG", 0, 0, imgWidth, sliceHeightMm);
          }
        }
      }

      pdf.save(`Einladung_ETV_${meeting?.title?.replace(/\s+/g, "_") || "Versammlung"}.pdf`);
      toast({ title: "PDF heruntergeladen", description: "Die Einladung wurde als PDF gespeichert." });
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast({ title: "Fehler", description: "PDF konnte nicht erstellt werden.", variant: "destructive" });
    }
  }, [meeting, logoBase64, greeting, closingText, additionalNotes, agendaItems, toast]);

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

      {/* Hidden offscreen A4 sheet — always mounted for html2canvas capture */}
      <div style={{ position: "fixed", left: "-9999px", top: 0, zIndex: -1, overflow: "hidden" }}>
        <A4Preview innerRef={offscreenRef} {...previewProps} />
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

            {/* Live preview side — A4 sheet scaled to fit */}
            <div className="border rounded-lg overflow-y-auto shadow-sm flex justify-center p-4" style={{ background: "#e8e8e8" }}>
              <div style={{ transform: "scale(0.52)", transformOrigin: "top center", width: "794px", height: "fit-content" }}>
                <A4Preview innerRef={previewRef} {...previewProps} />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};