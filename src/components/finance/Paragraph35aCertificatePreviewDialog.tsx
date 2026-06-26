import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  buildCertificateHtml,
  CertificateContext,
} from "./Paragraph35aCertificatePdf";
import { OwnerAssignment, ownerDisplayName } from "./lib/paragraph35aDistribution";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: OwnerAssignment | null;
  ctx: CertificateContext | null;
  templateId: string;
  buildingId: string;
  fiscalYear: number;
  periodId: string;
}

export function Paragraph35aCertificatePreviewDialog({
  open,
  onOpenChange,
  owner,
  ctx,
  templateId,
  buildingId,
  fiscalYear,
  periodId,
}: Props) {
  const { toast } = useToast();
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
    if (!owner) return;
    if (!templateId) {
      toast({ title: "Bitte zuerst eine Vorlage auswählen", variant: "destructive" });
      return;
    }
    setDownloading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/generate-35a-docx`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          template_id: templateId,
          building_id: buildingId,
          fiscal_year: fiscalYear,
          period_id: periodId,
          assignment_ids: [owner.id],
          format: "pdf",
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const cd = resp.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const fname = m?.[1] || `35a_${fiscalYear}.pdf`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      toast({
        title: "PDF-Export fehlgeschlagen",
        description: String((e as Error).message),
        variant: "destructive",
      });
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
          <Button size="sm" onClick={handleDownload} disabled={downloading || !owner || !templateId}>
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
