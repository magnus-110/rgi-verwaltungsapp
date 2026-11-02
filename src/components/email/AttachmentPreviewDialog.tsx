import { PenLine } from "lucide-react";
import { DokumentVorschauDialog, istPdfTyp } from "@/components/shared/PdfAnsicht";

interface AttachmentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  fileName: string;
  mimeType: string | null;
  /** Wenn gesetzt, erscheint bei PDFs der Knopf „Unterschreiben“. */
  onSign?: () => void;
}

/**
 * Vorschau von Anhängen (E-Mail, Ablage …) über die gemeinsame Anzeige:
 * PDFs als Seiten (react-pdf), Bilder als Bild, Text als Text.
 */
export const AttachmentPreviewDialog = ({ open, onOpenChange, url, fileName, mimeType, onSign }: AttachmentPreviewDialogProps) => (
  <DokumentVorschauDialog
    open={open}
    onOpenChange={onOpenChange}
    quelle={url}
    dateiName={fileName}
    mimeType={mimeType}
    aktionen={
      onSign && istPdfTyp(mimeType, fileName) ? (
        <button
          type="button"
          onClick={onSign}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#B35300] px-3 text-[13px] font-semibold text-white hover:bg-[#9A4700] sm:h-9"
        >
          <PenLine className="h-4 w-4" /> <span className="hidden sm:inline">Unterschreiben</span>
        </button>
      ) : undefined
    }
  />
);
