import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Paperclip, Download, FileText, Image, FileSpreadsheet, File, Sparkles, Loader2, Check, FolderArchive, ArrowDownToLine, ChevronDown, Layers, X, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { SaveAttachmentToBuildingDialog } from "./SaveAttachmentToBuildingDialog";
import { AttachmentPreviewDialog } from "./AttachmentPreviewDialog";
import { sanitizeStorageKey } from "@/lib/sanitizeStorageKey";
import { mergeImagesToPdf } from "./lib/mergeImagesToPdf";

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

const isImage = (mimeType: string | null, fileName: string) => {
  if (mimeType?.startsWith("image/jpeg") || mimeType?.startsWith("image/png")) return true;
  const lower = fileName.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
};

const isImportableInvoice = (mimeType: string | null, fileName: string) =>
  isPdf(mimeType, fileName) || isXml(mimeType, fileName) || isImage(mimeType, fileName);

export const EmailAttachments = ({ emailId }: EmailAttachmentsProps) => {
  const navigate = useNavigate();
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [saveToBuildingOpen, setSaveToBuildingOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<{ name: string; path: string; size: number | null; mimeType: string | null }[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ name: string; mimeType: string | null }>({ name: "", mimeType: null });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeImporting, setMergeImporting] = useState(false);

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
    att: { id: string; file_path: string | null; file_name: string; file_size: number | null; mime_type: string | null },
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
      let blob = await response.blob();
      let uploadFileName = att.file_name;

      // 2b. If image: convert to single-page PDF so OCR pipeline can consume it uniformly
      const isImageFile = isImage(att.mime_type, att.file_name);
      if (isImageFile) {
        blob = await mergeImagesToPdf([{ blob, mimeType: att.mime_type, fileName: att.file_name }]);
        uploadFileName = att.file_name.replace(/\.(jpe?g|png)$/i, "") + ".pdf";
      }

      // 3. Upload to invoices bucket (preserve extension for XML detection)
      const timestamp = Date.now();
      const folder = asCreditNote ? "credit_notes" : "unassigned";
      const safeName = sanitizeStorageKey(uploadFileName);
      const invoicePath = `${folder}/${timestamp}_${safeName}`;
      const isXmlFile = uploadFileName.toLowerCase().endsWith(".xml");
      const { error: uploadErr } = await supabase.storage
        .from("invoices")
        .upload(invoicePath, blob, { contentType: isXmlFile ? "application/xml" : "application/pdf" });
      if (uploadErr) throw uploadErr;

      // 4. Create invoice record (credit_note → status credit_open, sonst open)
      const insertPayload: any = {
        file_name: uploadFileName,
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const moveSelected = (id: string, dir: -1 | 1) => {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleImportMergedAsInvoice = async (asCreditNote: boolean) => {
    const selected = selectedIds
      .map((id) => attachments.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a && !!a.file_path);
    if (selected.length < 2) return;
    setMergeImporting(true);
    try {
      // 1. Download all images
      const images = await Promise.all(
        selected.map(async (att) => {
          const { data: signed, error } = await supabase.storage
            .from("email-attachments")
            .createSignedUrl(att.file_path!, 300);
          if (error || !signed?.signedUrl) throw new Error(`Datei nicht lesbar: ${att.file_name}`);
          const res = await fetch(signed.signedUrl);
          if (!res.ok) throw new Error(`Download fehlgeschlagen: ${att.file_name}`);
          const blob = await res.blob();
          return { blob, mimeType: att.mime_type, fileName: att.file_name };
        })
      );

      // 2. Merge to one PDF
      const pdfBlob = await mergeImagesToPdf(images);

      // 3. Upload to invoices bucket
      const timestamp = Date.now();
      const folder = asCreditNote ? "credit_notes" : "unassigned";
      const baseName = sanitizeStorageKey(`rechnung_${selected.length}seiten.pdf`);
      const invoicePath = `${folder}/${timestamp}_${baseName}`;
      const { error: upErr } = await supabase.storage
        .from("invoices")
        .upload(invoicePath, pdfBlob, { contentType: "application/pdf" });
      if (upErr) throw upErr;

      // 4. Create invoice
      const insertPayload: any = {
        file_name: baseName,
        file_path: invoicePath,
        status: asCreditNote ? "credit_open" : "open",
        ocr_status: "pending",
      };
      if (asCreditNote) insertPayload.invoice_type = "credit_note";

      const { data: invoice, error: insErr } = await (supabase
        .from("invoices") as any)
        .insert(insertPayload)
        .select("id")
        .single();
      if (insErr) throw insErr;

      // 5. Trigger OCR
      supabase.functions
        .invoke("extract-invoice", { body: { invoiceId: invoice.id } })
        .catch((err) => console.error("OCR trigger error:", err));

      if (asCreditNote) {
        supabase.functions
          .invoke("match-credit-note", { body: { invoiceId: invoice.id } })
          .catch((err) => console.error("Credit-note match error:", err));
      }

      setImportedIds((prev) => {
        const next = new Set(prev);
        selected.forEach((s) => next.add(s.id));
        return next;
      });
      setSelectedIds([]);
      toast.success(
        `${selected.length} Anhänge zu einer Rechnung zusammengeführt – OCR läuft`,
        {
          action: {
            label: asCreditNote ? "Zu Zahlungen (Eingehend)" : "Zu Zahlungen",
            onClick: () =>
              navigate(asCreditNote ? "/zahlungen?direction=incoming" : "/zahlungen?direction=outgoing"),
          },
        }
      );
    } catch (err: any) {
      toast.error("Zusammenführen fehlgeschlagen: " + err.message);
    } finally {
      setMergeImporting(false);
    }
  };

  const selectableImageCount = attachments.filter((a) => isImage(a.mime_type, a.file_name)).length;

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-2">
        <Paperclip className="h-4 w-4" />
        {attachments.length} Anhang{attachments.length > 1 ? "e" : ""}
      </div>

      {selectedIds.length >= 2 && (
        <div className="flex items-center justify-between gap-2 mb-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-medium">{selectedIds.length} Bilder ausgewählt</span>
            <span className="text-muted-foreground">
              · Reihenfolge:{" "}
              {selectedIds
                .map((id) => attachments.find((a) => a.id === id)?.file_name || "?")
                .join(" → ")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} disabled={mergeImporting}>
              <X className="h-3.5 w-3.5 mr-1" /> Auswahl aufheben
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={mergeImporting}>
                  {mergeImporting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Als eine Rechnung importieren
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleImportMergedAsInvoice(false)}>
                  <Sparkles className="h-3.5 w-3.5 mr-2" />
                  Eingangsrechnung (zu zahlen)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleImportMergedAsInvoice(true)}>
                  <ArrowDownToLine className="h-3.5 w-3.5 mr-2 text-green-600" />
                  Beleg für Zahlungseingang
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}


      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => {
          const Icon = getFileIcon(att.mime_type);
          const canImport = isImportableInvoice(att.mime_type, att.file_name);
          const isImporting = importingId === att.id;
          const isImported = importedIds.has(att.id);
          const canSelect = isImage(att.mime_type, att.file_name) && !!att.file_path && !isImported;
          const selectedIdx = selectedIds.indexOf(att.id);
          const isSelected = selectedIdx >= 0;

          return (
            <div
              key={att.id}
              className={`flex items-center gap-1 rounded-md ${isSelected ? "ring-2 ring-primary/40 bg-primary/5 pl-1" : ""}`}
            >
              {canSelect && (
                <div className="flex items-center gap-0.5">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(att.id)}
                    aria-label="Für Zusammenführung auswählen"
                  />
                  {isSelected && selectedIds.length > 1 && (
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => moveSelected(att.id, -1)}
                        disabled={selectedIdx === 0}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Nach vorne"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelected(att.id, 1)}
                        disabled={selectedIdx === selectedIds.length - 1}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Nach hinten"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {isSelected && (
                    <span className="text-xs font-semibold text-primary w-4 text-center">
                      {selectedIdx + 1}
                    </span>
                  )}
                </div>
              )}
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
      <AttachmentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={previewUrl}
        fileName={previewMeta.name}
        mimeType={previewMeta.mimeType}
      />
    </div>
  );
};
