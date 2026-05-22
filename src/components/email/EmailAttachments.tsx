import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Paperclip, Download, FileText, Image, FileSpreadsheet, File, Sparkles, Loader2, Check, FolderArchive, ArrowDownToLine, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { SaveAttachmentToBuildingDialog } from "./SaveAttachmentToBuildingDialog";
import { AttachmentPreviewDialog } from "./AttachmentPreviewDialog";
import { sanitizeStorageKey } from "@/lib/sanitizeStorageKey";

interface EmailAttachmentsProps {
  emailId: string;
}

const getFileIcon = (mimeType: string | null) => {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return FileSpreadsheet;
  return File;
};

const formatSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isPdf = (mimeType: string | null, fileName: string) => {
  if (mimeType?.includes("pdf")) return true;
  return fileName.toLowerCase().endsWith(".pdf");
};

const isXml = (mimeType: string | null, fileName: string) => {
  if (mimeType?.includes("xml")) return true;
  return fileName.toLowerCase().endsWith(".xml");
};

const isImportableInvoice = (mimeType: string | null, fileName: string) =>
  isPdf(mimeType, fileName) || isXml(mimeType, fileName);

export const EmailAttachments = ({ emailId }: EmailAttachmentsProps) => {
  const navigate = useNavigate();
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [saveToBuildingOpen, setSaveToBuildingOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<{ name: string; path: string; size: number | null; mimeType: string | null }[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ name: string; mimeType: string | null }>({ name: "", mimeType: null });

  const { data: attachments = [] } = useQuery({
    queryKey: ["email-attachments", emailId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_attachments")
        .select("*")
        .eq("email_id", emailId)
        .eq("is_inline", false)
        .order("file_name");
      if (error) throw error;
      return data;
    },
  });

  if (attachments.length === 0) return null;

  const handleOpenPreview = async (filePath: string, fileName: string, mimeType: string | null) => {
    setPreviewMeta({ name: fileName, mimeType });
    setPreviewUrl(null);
    setPreviewOpen(true);
    try {
      const { data, error } = await supabase.storage
        .from("email-attachments")
        .createSignedUrl(filePath, 300);
      if (error) throw error;
      setPreviewUrl(data.signedUrl);
    } catch (err: any) {
      toast.error("Vorschau fehlgeschlagen: " + err.message);
      setPreviewOpen(false);
    }
  };

  const handleImportAsInvoice = async (
    att: { id: string; file_path: string | null; file_name: string; file_size: number | null },
    asCreditNote: boolean = false
  ) => {
    if (!att.file_path) return;
    setImportingId(att.id);

    try {
      // 1. Get signed URL for the attachment
      const { data: signedData, error: signedErr } = await supabase.storage
        .from("email-attachments")
        .createSignedUrl(att.file_path, 300);
      if (signedErr || !signedData?.signedUrl) throw new Error("Datei nicht lesbar");

      // 2. Download the file
      const response = await fetch(signedData.signedUrl);
      if (!response.ok) throw new Error("Download fehlgeschlagen");
      const blob = await response.blob();

      // 3. Upload to invoices bucket (preserve extension for XML detection)
      const timestamp = Date.now();
      const folder = asCreditNote ? "credit_notes" : "unassigned";
      const safeName = sanitizeStorageKey(att.file_name);
      const invoicePath = `${folder}/${timestamp}_${safeName}`;
      const isXmlFile = att.file_name.toLowerCase().endsWith(".xml");
      const { error: uploadErr } = await supabase.storage
        .from("invoices")
        .upload(invoicePath, blob, { contentType: isXmlFile ? "application/xml" : "application/pdf" });
      if (uploadErr) throw uploadErr;

      // 4. Create invoice record (credit_note → status credit_open, sonst open)
      const insertPayload: any = {
        file_name: att.file_name,
        file_path: invoicePath,
        status: asCreditNote ? "credit_open" : "open",
        ocr_status: "pending",
      };
      if (asCreditNote) {
        insertPayload.invoice_type = "credit_note";
      }

      const { data: invoice, error: insertErr } = await (supabase
        .from("invoices") as any)
        .insert(insertPayload)
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      // 5. Trigger OCR extraction
      supabase.functions.invoke("extract-invoice", {
        body: { invoiceId: invoice.id },
      }).catch(err => console.error("OCR trigger error:", err));

      // 5b. Bei Belegen: Rückwärts-Match gegen offene Bank-Eingänge der letzten 90 Tage
      if (asCreditNote) {
        supabase.functions.invoke("match-credit-note", {
          body: { invoiceId: invoice.id },
        }).catch(err => console.error("Credit-note match error:", err));
      }

      setImportedIds(prev => new Set(prev).add(att.id));
      toast.success(
        asCreditNote
          ? "Beleg für Zahlungseingang importiert – OCR läuft"
          : "Rechnung importiert – OCR läuft",
        {
          action: {
            label: asCreditNote ? "Zu Zahlungen (Eingehend)" : "Zu Zahlungen",
            onClick: () => navigate(asCreditNote ? "/zahlungen?direction=incoming" : "/zahlungen?direction=outgoing"),
          },
        }
      );
    } catch (err: any) {
      toast.error("Import fehlgeschlagen: " + err.message);
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
        <Paperclip className="h-4 w-4" />
        {attachments.length} Anhang{attachments.length > 1 ? "e" : ""}
      </div>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => {
          const Icon = getFileIcon(att.mime_type);
          const canImport = isImportableInvoice(att.mime_type, att.file_name);
          const isImporting = importingId === att.id;
          const isImported = importedIds.has(att.id);

          return (
            <div key={att.id} className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-auto py-1.5 px-2.5"
                onClick={() => att.file_path && handleOpenPreview(att.file_path, att.file_name, att.mime_type)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[150px]">{att.file_name}</span>
                {att.file_size && (
                  <span className="text-xs text-muted-foreground">
                    ({formatSize(Number(att.file_size))})
                  </span>
                )}
                <Download className="h-3 w-3 shrink-0" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto py-1.5 px-1.5"
                title="In Stammakte ablegen"
                onClick={() => {
                  if (!att.file_path) return;
                  setPendingAttachments([{ name: att.file_name, path: att.file_path, size: att.file_size ? Number(att.file_size) : null, mimeType: att.mime_type }]);
                  setSaveToBuildingOpen(true);
                }}
              >
                <FolderArchive className="h-3.5 w-3.5" />
              </Button>
              {canImport && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={isImported ? "secondary" : "ghost"}
                      size="sm"
                      className="h-auto py-1.5 px-1.5"
                      disabled={isImporting || isImported}
                      title={isImported ? "Bereits importiert" : "Als Rechnung importieren"}
                    >
                      {isImporting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isImported ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <ChevronDown className="h-3 w-3 ml-0.5" />
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleImportAsInvoice(att, false)}>
                      <Sparkles className="h-3.5 w-3.5 mr-2" />
                      Eingangsrechnung (zu zahlen)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleImportAsInvoice(att, true)}>
                      <ArrowDownToLine className="h-3.5 w-3.5 mr-2 text-green-600" />
                      Beleg für Zahlungseingang
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
      <SaveAttachmentToBuildingDialog
        open={saveToBuildingOpen}
        onOpenChange={setSaveToBuildingOpen}
        attachments={pendingAttachments}
        emailId={emailId}
      />
    </div>
  );
};
