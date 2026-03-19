import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  buildings: { id: string; name: string; building_code: string }[];
}

export function InvoiceDropZone({ buildings }: Props) {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.includes("pdf")) {
      toast.error(`"${file.name}" ist keine PDF-Datei`);
      return;
    }

    if (!selectedBuilding) {
      toast.error("Bitte zuerst eine Liegenschaft auswählen");
      return;
    }

    const fileName = file.name;
    setUploading(prev => [...prev, fileName]);

    try {
      // Upload to storage
      const filePath = `${selectedBuilding}/${Date.now()}_${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create invoice record
      const { data: invoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          building_id: selectedBuilding,
          file_path: filePath,
          file_name: fileName,
          status: "open",
          ocr_status: "pending",
          created_by: user?.id,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      toast.success(`"${fileName}" hochgeladen – OCR wird gestartet...`);

      // Trigger OCR extraction (fire-and-forget, poll via query)
      const { data: { session } } = await supabase.auth.getSession();
      supabase.functions.invoke("extract-invoice", {
        body: { invoiceId: invoice.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      }).catch(err => {
        console.error("OCR error:", err);
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      });

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
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
      <div className="flex items-center gap-3">
        <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
          <SelectTrigger className="w-64 h-9 text-sm">
            <SelectValue placeholder="Liegenschaft für Upload wählen..." />
          </SelectTrigger>
          <SelectContent>
            {buildings.map(b => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {uploading.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {uploading.length} Datei(en) werden verarbeitet...
          </div>
        )}
      </div>

      <label
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
          !selectedBuilding && "opacity-50 cursor-not-allowed"
        )}
        onDragOver={(e) => { e.preventDefault(); if (selectedBuilding) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={selectedBuilding ? handleDrop : (e) => e.preventDefault()}
      >
        <input
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFileInput}
          disabled={!selectedBuilding}
        />
        <div className="flex items-center gap-3">
          {uploading.length > 0 ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium">
              PDF-Rechnungen hierher ziehen oder klicken
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Mehrere Dateien gleichzeitig möglich • OCR-Extraktion automatisch
            </p>
          </div>
        </div>
      </label>
    </div>
  );
}
