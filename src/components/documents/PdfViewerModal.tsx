import { DokumentVorschauDialog } from "@/components/shared/PdfAnsicht";

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentUrl: string | null;
  documentName: string;
  initialPage?: number;
}

/** Großes PDF-Fenster – nutzt die gemeinsame Dokument-Anzeige. */
export function PdfViewerModal({ isOpen, onClose, documentUrl, documentName, initialPage = 1 }: PdfViewerModalProps) {
  return (
    <DokumentVorschauDialog
      open={isOpen}
      onOpenChange={(v) => !v && onClose()}
      quelle={documentUrl}
      dateiName={documentName}
      mimeType="application/pdf"
      startSeite={Number.isFinite(initialPage) && initialPage > 0 ? initialPage : 1}
    />
  );
}
