import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Upload } from "lucide-react";
import { LetterCampaignWizard } from "@/components/communication/LetterCampaignWizard";
import { TemplateUploadDialog } from "@/components/communication/TemplateUploadDialog";

interface MeetingInvitationPdfProps {
  meetingId: string;
  buildingId: string;
}

/**
 * Einladung als Serienbrief: Word-Vorlage hochladen, mit ETV-Platzhaltern
 * ({{meeting_date}}, {{meeting_time}}, {{meeting_location}}, {{agenda_list}},
 * {{vollname}}, {{adresse_block}}, {{einheit}} …) befüllen und als DOCX
 * oder PDF (via CloudConvert) herunterladen.
 */
export const MeetingInvitationPdf = ({ meetingId, buildingId }: MeetingInvitationPdfProps) => {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Einladung aus Word-Vorlage erstellen
        </h4>
        <p className="text-sm text-muted-foreground">
          Laden Sie eine .docx-Vorlage hoch (z.B. Ihren Briefkopf mit Platzhaltern) –
          die App füllt sie automatisch pro Eigentümer und stellt das Ergebnis als
          DOCX oder PDF (via CloudConvert) zum Download bereit.
        </p>
        <p className="text-xs text-muted-foreground">
          Unterstützte Platzhalter u.a.: <code className="bg-background px-1 rounded">{"{{vollname}}"}</code>,{" "}
          <code className="bg-background px-1 rounded">{"{{adresse_block}}"}</code>,{" "}
          <code className="bg-background px-1 rounded">{"{{einheit}}"}</code>,{" "}
          <code className="bg-background px-1 rounded">{"{{meeting_date}}"}</code>,{" "}
          <code className="bg-background px-1 rounded">{"{{meeting_time}}"}</code>,{" "}
          <code className="bg-background px-1 rounded">{"{{meeting_location}}"}</code>,{" "}
          <code className="bg-background px-1 rounded">{"{{agenda_list}}"}</code>
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setWizardOpen(true)} className="gap-2">
          <FileText className="h-4 w-4" />
          Einladung erstellen
        </Button>
        <Button onClick={() => setUploadOpen(true)} variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Neue Vorlage hochladen
        </Button>
      </div>

      <LetterCampaignWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        buildingId={buildingId}
        meetingId={meetingId}
        titlePrefix="Einladung ETV"
      />

      <TemplateUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        buildingId={buildingId}
        defaultType="letter"
      />
    </div>
  );
};
