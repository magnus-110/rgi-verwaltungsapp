import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageKey } from "@/lib/sanitizeStorageKey";
import { mergeImagesToPdf } from "./mergeImagesToPdf";

export interface ImportableAttachment {
  id: string;
  file_path: string | null;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
}

const isImageFile = (mimeType: string | null, fileName: string) => {
  if (mimeType?.startsWith("image/jpeg") || mimeType?.startsWith("image/png")) return true;
  const lower = fileName.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
};

/**
 * Import an email attachment (regular OR inline image) as an invoice or credit note.
 * Mirrors the logic from EmailAttachments.handleImportAsInvoice so it can be reused
 * from the inline-image context menu in EmailHtmlBody.
 */
export function useImportAttachmentAsInvoice() {
  const navigate = useNavigate();
  const [importingId, setImportingId] = useState<string | null>(null);

  const importAsInvoice = async (att: ImportableAttachment, asCreditNote = false) => {
    if (!att.file_path) {
      toast.error("Datei nicht verfügbar");
      return;
    }
    setImportingId(att.id);
    try {
      const { data: signedData, error: signedErr } = await supabase.storage
        .from("email-attachments")
        .createSignedUrl(att.file_path, 300);
      if (signedErr || !signedData?.signedUrl) throw new Error("Datei nicht lesbar");

      const response = await fetch(signedData.signedUrl);
      if (!response.ok) throw new Error("Download fehlgeschlagen");
      let blob = await response.blob();
      let uploadFileName = att.file_name;

      if (isImageFile(att.mime_type, att.file_name)) {
        blob = await mergeImagesToPdf([{ blob, mimeType: att.mime_type, fileName: att.file_name }]);
        uploadFileName = att.file_name.replace(/\.(jpe?g|png)$/i, "") + ".pdf";
      }

      const timestamp = Date.now();
      const folder = asCreditNote ? "credit_notes" : "unassigned";
      const safeName = sanitizeStorageKey(uploadFileName);
      const invoicePath = `${folder}/${timestamp}_${safeName}`;
      const isXmlFile = uploadFileName.toLowerCase().endsWith(".xml");
      const { error: uploadErr } = await supabase.storage
        .from("invoices")
        .upload(invoicePath, blob, { contentType: isXmlFile ? "application/xml" : "application/pdf" });
      if (uploadErr) throw uploadErr;

      const insertPayload: any = {
        file_name: uploadFileName,
        file_path: invoicePath,
        status: asCreditNote ? "credit_open" : "open",
        ocr_status: "pending",
      };
      if (asCreditNote) insertPayload.invoice_type = "credit_note";

      const { data: invoice, error: insertErr } = await (supabase
        .from("invoices") as any)
        .insert(insertPayload)
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      supabase.functions
        .invoke("extract-invoice", { body: { invoiceId: invoice.id } })
        .catch((err) => console.error("OCR trigger error:", err));

      if (asCreditNote) {
        supabase.functions
          .invoke("match-credit-note", { body: { invoiceId: invoice.id } })
          .catch((err) => console.error("Credit-note match error:", err));
      }

      toast.success(
        asCreditNote
          ? "Beleg für Zahlungseingang importiert – OCR läuft"
          : "Rechnung importiert – OCR läuft",
        {
          action: {
            label: asCreditNote ? "Zu Zahlungen (Eingehend)" : "Zu Zahlungen",
            onClick: () =>
              navigate(asCreditNote ? "/zahlungen?direction=incoming" : "/zahlungen?direction=outgoing"),
          },
        }
      );
    } catch (err: any) {
      toast.error("Import fehlgeschlagen: " + err.message);
    } finally {
      setImportingId(null);
    }
  };

  return { importAsInvoice, importingId };
}
