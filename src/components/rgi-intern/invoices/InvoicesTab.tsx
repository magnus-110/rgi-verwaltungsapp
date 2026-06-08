import { useState } from "react";
import { useRgiInvoices, useRgiClients, rgiSignedUrl, rgiRenderInvoice } from "@/hooks/useRgi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Download, RefreshCw, FileType } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { InvoiceEditorDialog } from "./InvoiceEditorDialog";
import { toast } from "sonner";

const STATUS_COLOR: Record<string, string> = {
  draft: "secondary", sent: "default", partial: "default", paid: "default", overdue: "destructive", cancelled: "outline",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf", sent: "Versendet", partial: "Teilzahlung", paid: "Bezahlt", overdue: "Überfällig", cancelled: "Storniert",
};

export function InvoicesTab() {
  const { data: invoices, isLoading } = useRgiInvoices();
  const { data: clients } = useRgiClients();
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [renderingId, setRenderingId] = useState<string | null>(null);

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? "—";

  const openPdf = async (path: string) => {
    const url = await rgiSignedUrl("rgi-invoices", path);
    window.open(url, "_blank");
  };

  const downloadFile = async (path: string) => {
    try {
      const url = await rgiSignedUrl("rgi-invoices", path);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = path.split("/").pop() || "Rechnung.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e: any) {
      toast.error(`Download fehlgeschlagen: ${e.message}`);
    }
  };

  const render = async (id: string) => {
    setRenderingId(id);
    try {
      const r = await rgiRenderInvoice(id);
      toast.success("PDF erzeugt");
      if (r?.pdf_path) await openPdf(r.pdf_path);
    } catch (e: any) {
      toast.error(`PDF-Rendering fehlgeschlagen: ${e.message}`);
    } finally {
      setRenderingId(null);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditorId(null); setEditorOpen(true); }} className="gap-1.5"><Plus className="w-4 h-4" />Neue Rechnung</Button>
      </div>

      {isLoading ? <Skeleton className="h-64" /> : (
        <Card className="divide-y">
          {(invoices ?? []).length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Noch keine Rechnungen erstellt.
            </div>
          )}
          {invoices?.map((inv) => (
            <div key={inv.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium font-mono">{inv.invoice_number ?? "ENTWURF"}</span>
                  <Badge variant={STATUS_COLOR[inv.status] as any}>{STATUS_LABEL[inv.status]}</Badge>
                  <span className="text-sm">{clientName(inv.client_id)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {inv.issue_date} · {Number(inv.total_gross).toFixed(2)} € brutto
                  {inv.paid_amount > 0 && ` · ${Number(inv.paid_amount).toFixed(2)} € bezahlt`}
                </div>
              </div>
              {inv.docx_storage_path && (
                <Button variant="ghost" size="sm" onClick={() => downloadFile(inv.docx_storage_path!)} title="Word herunterladen"><FileType className="w-4 h-4" /></Button>
              )}
              {inv.pdf_storage_path && (
                <Button variant="ghost" size="sm" onClick={() => openPdf(inv.pdf_storage_path!)} title="PDF herunterladen"><Download className="w-4 h-4" /></Button>
              )}
              <Button variant="ghost" size="sm" disabled={renderingId === inv.id} onClick={() => render(inv.id)}>
                <RefreshCw className={`w-4 h-4 ${renderingId === inv.id ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setEditorId(inv.id); setEditorOpen(true); }}>
                Öffnen
              </Button>
            </div>
          ))}
        </Card>
      )}

      <InvoiceEditorDialog open={editorOpen} onOpenChange={setEditorOpen} invoiceId={editorId} />
    </div>
  );
}
