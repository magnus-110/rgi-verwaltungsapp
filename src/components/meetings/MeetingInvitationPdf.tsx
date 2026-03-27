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
    if (!meeting) return;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const margin = 25;
    const contentWidth = pageWidth - 2 * margin;
    let y = margin;

    // Colors
    const orange = [238, 114, 2] as [number, number, number];
    const anthracite = [74, 72, 73] as [number, number, number];
    const gray = [150, 150, 150] as [number, number, number];

    // Try to load logo — top right corner
    let logoH = 15;
    try {
      const logoUrl = `${window.location.origin}/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png`;
      const img = await loadImage(logoUrl);
      const logoW = (img.width / img.height) * logoH;
      pdf.addImage(img, "PNG", pageWidth - margin - logoW, y, logoW, logoH);
    } catch {
      // Logo loading failed, continue without
    }

    // Move y below the logo area before starting content
    y += logoH + 8;

    // Title
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.setTextColor(...anthracite);
    pdf.text("Einladung zur Eigentümerversammlung", margin, y);
    y += 7;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...gray);
    pdf.text(building?.name || "", margin, y);

    // Orange line
    y += 20;
    pdf.setDrawColor(...orange);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 10;

    // Meta block
    pdf.setFontSize(10);
    const metaRows = [
      ["Liegenschaft:", `${building?.name || ""}, ${building?.address || ""}`],
      ["Datum:", dateStr],
      ["Uhrzeit:", `${timeStr} Uhr`],
    ];
    if (meeting.location) metaRows.push(["Ort:", meeting.location]);
    if (building?.manager_name) metaRows.push(["Verwalter:", building.manager_name]);

    for (const [label, value] of metaRows) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...anthracite);
      pdf.text(label, margin, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(value, margin + 30, y);
      y += 5.5;
    }

    y += 8;

    // Greeting
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(...anthracite);
    const greetingLines = pdf.splitTextToSize(greeting, contentWidth);
    for (const line of greetingLines) {
      if (y > 270) { pdf.addPage(); y = margin; }
      pdf.text(line, margin, y);
      y += 5;
    }

    y += 6;

    // Section title "Tagesordnung"
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Tagesordnung", margin, y);
    y += 2;
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 7;

    // Agenda items
    for (let i = 0; i < agendaItems.length; i++) {
      const item = agendaItems[i] as any;
      if (y > 255) { pdf.addPage(); y = margin; }

      // Left orange bar + background
      const itemStartY = y - 2;
      const titleText = `TOP ${i + 1}   ${item.title}`;
      const descLines = item.description ? pdf.splitTextToSize(item.description, contentWidth - 10) : [];
      const itemHeight = 8 + (descLines.length > 0 ? descLines.length * 4.5 + 2 : 0);

      pdf.setFillColor(250, 248, 245);
      pdf.roundedRect(margin, itemStartY, contentWidth, itemHeight, 1.5, 1.5, "F");
      pdf.setFillColor(...orange);
      pdf.rect(margin, itemStartY, 1, itemHeight, "F");

      // TOP number in orange
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...orange);
      pdf.text(`TOP ${i + 1}`, margin + 4, y + 2);

      // Title
      pdf.setTextColor(...anthracite);
      pdf.text(item.title, margin + 20, y + 2);

      y += 7;

      // Description
      if (descLines.length > 0) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(100, 100, 100);
        for (const dl of descLines) {
          pdf.text(dl, margin + 4, y);
          y += 4.5;
        }
      }

      y += 5;
    }

    // Additional notes
    if (additionalNotes.trim()) {
      y += 4;
      if (y > 255) { pdf.addPage(); y = margin; }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(...anthracite);
      const noteLines = pdf.splitTextToSize(additionalNotes, contentWidth);
      for (const nl of noteLines) {
        if (y > 270) { pdf.addPage(); y = margin; }
        pdf.text(nl, margin, y);
        y += 5;
      }
    }

    // Closing text
    y += 6;
    if (y > 255) { pdf.addPage(); y = margin; }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(...anthracite);
    const closingLines = pdf.splitTextToSize(closingText, contentWidth);
    for (const cl of closingLines) {
      if (y > 270) { pdf.addPage(); y = margin; }
      pdf.text(cl, margin, y);
      y += 5;
    }

    // Manager name after closing
    if (building?.manager_name) {
      y += 4;
      pdf.setFont("helvetica", "bold");
      pdf.text(building.manager_name, margin, y);
    }

    // Footer line
    const footerY = 285;
    pdf.setDrawColor(...orange);
    pdf.setLineWidth(0.3);
    pdf.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...gray);
    const footerText = `Erstellt am ${format(new Date(), "dd.MM.yyyy", { locale: de })} | ${building?.manager_name || "Hausverwaltung"}`;
    pdf.text(footerText, pageWidth / 2, footerY, { align: "center" });

    pdf.save(`Einladung_ETV_${meeting?.title?.replace(/\s+/g, "_") || "Versammlung"}.pdf`);
    toast({ title: "PDF heruntergeladen", description: "Die Einladung wurde als PDF gespeichert." });
  };

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
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
            <div className="border rounded-lg bg-white overflow-y-auto shadow-sm" ref={previewRef}>
              <div className="p-8 text-[11px] leading-relaxed" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", color: "#4a4849", maxWidth: "600px" }}>
                {/* Logo top right */}
                <div className="flex justify-end mb-4">
                  <img
                    src="/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png"
                    alt="Logo"
                    className="h-12 object-contain"
                  />
                </div>
                {/* Header below logo */}
                <div className="pb-3 mb-6 border-b-2" style={{ borderColor: "#ee7202" }}>
                  <h1 className="text-[16px] font-bold m-0" style={{ color: "#4a4849" }}>
                    Einladung zur Eigentümerversammlung
                  </h1>
                  <p className="text-[10px] mt-1" style={{ color: "#999" }}>{building?.name || ""}</p>
                </div>

                {/* Meta */}
                <div className="mb-5 text-[10px]">
                  <div className="flex mb-1"><span className="font-semibold w-24">Liegenschaft:</span><span>{building?.name}, {building?.address}</span></div>
                  <div className="flex mb-1"><span className="font-semibold w-24">Datum:</span><span>{dateStr}</span></div>
                  <div className="flex mb-1"><span className="font-semibold w-24">Uhrzeit:</span><span>{timeStr} Uhr</span></div>
                  {meeting?.location && <div className="flex mb-1"><span className="font-semibold w-24">Ort:</span><span>{meeting.location}</span></div>}
                  {building?.manager_name && <div className="flex mb-1"><span className="font-semibold w-24">Verwalter:</span><span>{building.manager_name}</span></div>}
                </div>

                {/* Greeting */}
                <div className="mb-4 whitespace-pre-line">{greeting}</div>

                {/* Agenda */}
                <h2 className="text-[12px] font-bold mb-1 pb-1 border-b" style={{ color: "#4a4849" }}>Tagesordnung</h2>
                <div className="mt-3 space-y-2">
                  {agendaItems.map((item: any, idx: number) => (
                    <div key={item.id} className="p-2 rounded" style={{ background: "#faf8f5", borderLeft: "3px solid #ee7202" }}>
                      <div>
                        <span className="font-bold text-[9px]" style={{ color: "#ee7202" }}>TOP {idx + 1}</span>
                        <span className="font-semibold ml-2">{item.title}</span>
                      </div>
                      {item.description && <p className="text-[9px] mt-0.5" style={{ color: "#666" }}>{item.description}</p>}
                    </div>
                  ))}
                </div>

                {/* Additional notes */}
                {additionalNotes.trim() && (
                  <div className="mt-4 whitespace-pre-line">{additionalNotes}</div>
                )}

                {/* Closing */}
                <div className="mt-5 whitespace-pre-line">{closingText}</div>
                {building?.manager_name && <p className="font-bold mt-3">{building.manager_name}</p>}

                {/* Footer */}
                <div className="mt-8 pt-3 border-t text-center text-[8px]" style={{ borderColor: "#ee7202", color: "#999" }}>
                  Erstellt am {format(new Date(), "dd.MM.yyyy", { locale: de })} | {building?.manager_name || "Hausverwaltung"}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
