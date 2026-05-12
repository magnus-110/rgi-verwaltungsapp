import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import {
  buildCertificateHtml,
  CertificateContext,
  generate35aPdf,
} from "./Paragraph35aCertificatePdf";
import { OwnerAssignment, ownerDisplayName } from "./lib/paragraph35aDistribution";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: OwnerAssignment | null;
  ctx: CertificateContext | null;
}

export function Paragraph35aCertificatePreviewDialog({ open, onOpenChange, owner, ctx }: Props) {
  const [downloading, setDownloading] = useState(false);

  const html = useMemo(() => {
    if (!owner || !ctx) return "";
    return buildCertificateHtml(owner, ctx);
  }, [owner, ctx]);

  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"/><style>body{margin:0;background:#f3f4f6;}</style></head><body>${html}</body></html>`,
    [html],
  );

  const handleDownload = async () => {
    if (!owner || !ctx) return;
    setDownloading(true);
    try {
      await generate35aPdf(owner, ctx);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-3 border-b flex flex-row items-center justify-between gap-2 space-y-0">
          <DialogTitle className="text-base">
            §35a Bescheinigung {ctx?.fiscalYear} – {owner ? ownerDisplayName(owner) : ""}
          </DialogTitle>
          <Button size="sm" onClick={handleDownload} disabled={downloading || !owner}>
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            PDF herunterladen
          </Button>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/40">
          {owner && ctx ? (
            <iframe
              title="35a-preview"
              srcDoc={srcDoc}
              className="w-full h-full border-0 bg-white"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
