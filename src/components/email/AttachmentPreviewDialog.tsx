import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

interface AttachmentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  fileName: string;
  mimeType: string | null;
}

const isImage = (mime: string | null, name: string) =>
  (mime?.startsWith("image/") ?? false) ||
  /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);

const isPdf = (mime: string | null, name: string) =>
  (mime?.includes("pdf") ?? false) || /\.pdf$/i.test(name);

const isText = (mime: string | null, name: string) =>
  (mime?.startsWith("text/") ?? false) ||
  /\.(txt|csv|xml|json|md|log)$/i.test(name);

export const AttachmentPreviewDialog = ({
  open,
  onOpenChange,
  url,
  fileName,
  mimeType,
}: AttachmentPreviewDialogProps) => {
  const previewable = !!url && (isPdf(mimeType, fileName) || isImage(mimeType, fileName) || isText(mimeType, fileName));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[90vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-3 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle className="truncate pr-4">{fileName}</DialogTitle>
          <div className="flex items-center gap-2 mr-6">
            {url && (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1.5" /> Neuer Tab
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={url} download={fileName}>
                    <Download className="h-4 w-4 mr-1.5" /> Download
                  </a>
                </Button>
              </>
            )}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/30">
          {!url ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Lade Vorschau…
            </div>
          ) : isImage(mimeType, fileName) ? (
            <div className="h-full flex items-center justify-center p-4">
              <img src={url} alt={fileName} className="max-h-full max-w-full object-contain" />
            </div>
          ) : isPdf(mimeType, fileName) || isText(mimeType, fileName) ? (
            <iframe src={url} title={fileName} className="w-full h-full border-0 bg-white" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <p>Vorschau für diesen Dateityp nicht verfügbar.</p>
              <Button asChild>
                <a href={url} download={fileName}>
                  <Download className="h-4 w-4 mr-1.5" /> Datei herunterladen
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
