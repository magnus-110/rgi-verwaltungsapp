import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sanitizeStorageKey } from "@/lib/sanitizeStorageKey";

interface Props {
  buildings: { id: string; name: string }[];
  selectedBuildingId?: string;
}

export function InvoiceDropZone({ buildings, selectedBuildingId = "" }: Props) {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const selectedBuilding = selectedBuildingId;

  const uploadFile = useCallback(async (file: File) => {
    const lowerName = file.name.toLowerCase();
    const isPdf = file.type.includes("pdf") || lowerName.endsWith(".pdf");
    const isXml = file.type.includes("xml") || lowerName.endsWith(".xml");
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(lowerName);
    if (!isPdf && !isXml && !isImage) {
      toast.error(`"${file.name}" ist keine PDF-, XML- oder Bilddatei`);
      return;
    }

    const fileName = file.name;
    setUploading(prev => [...prev, fileName]);

    try {
      // Note: Duplikate werden NACH der OCR anhand der Rechnungsnummer + Lieferant
      // erkannt (siehe extract-invoice Edge Function). Identische Dateinamen sind
      // erlaubt, da Handwerker oft alle Rechnungen gleich benennen.

      // Use building folder, "company" for RGI invoices, or "unassigned"
      const isCompany = selectedBuilding === "company";
      const folderPrefix = isCompany ? "company" : (selectedBuilding || "unassigned");
      const filePath = `${folderPrefix}/${Date.now()}_${sanitizeStorageKey(fileName)}`;
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create invoice record (building_id is null if company or not selected)
      const { data: invoice, error: insertError } = await (supabase
        .from("invoices") as any)
        .insert({
          building_id: isCompany ? null : (selectedBuilding || null),
          is_company_invoice: isCompany,
          file_path: filePath,
          file_name: fileName,
          status: "open",
          ocr_status: "pending",
          created_by: user?.id,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      toast.success(`"${fileName}" hochgeladen – OCR & Liegenschaftserkennung wird gestartet...`);

      // Trigger OCR extraction (fire-and-forget)
      const { data: { session } } = await supabase.auth.getSession();
      supabase.functions.invoke("extract-invoice", {
        body: { invoiceId: invoice.id, isCompanyInvoice: isCompany },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        queryClient.invalidateQueries({ queryKey: ["transfer-invoices"] });
      }).catch(err => {
        console.error("OCR error:", err);
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        queryClient.invalidateQueries({ queryKey: ["transfer-invoices"] });
      });

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["transfer-invoices"] });
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(`Fehler bei "${fileName}": ${err.message}`);
    } finally {
      setUploading(prev => prev.filter(n => n !== fileName));
    }
  }, [selectedBuilding, queryClient]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(uploadFile);
  }, [uploadFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(uploadFile);
    e.target.value = "";
  }, [uploadFile]);

  return (
    <div className="space-y-3">
      {uploading.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {uploading.length} Datei(en) werden verarbeitet...
        </div>
      )}


      <label
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf,.xml,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,application/xml,text/xml,image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        <div className="flex items-center gap-3">
          {uploading.length > 0 ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium">
              Rechnungen hierher ziehen oder klicken
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3" />
              PDF, XML (XRechnung/ZUGFeRD) oder Foto/Scan (JPG, PNG) • {selectedBuilding ? (selectedBuilding === "company" ? "Wird RGI Immobilien (Firma) zugeordnet" : "Wird der ausgewählten Liegenschaft zugeordnet") : "Liegenschaft wird automatisch erkannt"}
            </p>
          </div>
        </div>
      </label>
    </div>
  );
}