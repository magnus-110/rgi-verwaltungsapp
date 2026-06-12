import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, FileText, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { BookingInstructionsSection } from "@/components/buildings/BookingInstructionsSection";
import { BookingsTab } from "@/components/finance/BookingsTab";
import { sanitizeStorageKey } from "@/lib/sanitizeStorageKey";
import { TenantsInPeriodTable } from "@/components/finance/rent/TenantsInPeriodTable";

interface Props {
  buildingId: string;
  periodId: string | null;
  fiscalYear: number | null;
}

const ACCEPT_EXT = ".pdf,.xml,.xlsx,.xls,.csv";
const ACCEPT_MIME =
  "application/pdf,application/xml,text/xml," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-excel,text/csv";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RentBelegDropZone({ buildingId, fiscalYear }: { buildingId: string; fiscalYear: number | null }) {
  const queryClient = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const { data: files = [], refetch } = useQuery({
    queryKey: ["rent-belege", buildingId, fiscalYear],
    queryFn: async () => {
      if (!buildingId || !fiscalYear) return [];
      const yearPrefix = `${buildingId}/belege/${fiscalYear}/`;
      const { data, error } = await supabase
        .from("building_files")
        .select("id, display_name, file_path, file_size, mime_type, created_at")
        .eq("building_id", buildingId)
        .like("file_path", `${yearPrefix}%`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildingId && !!fiscalYear,
  });

  const handleUpload = useCallback(
    async (file: File) => {
      if (!fiscalYear) {
        toast.error("Bitte zuerst ein Wirtschaftsjahr wählen");
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error("Datei darf maximal 50 MB groß sein");
        return;
      }
      setUploading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Nicht angemeldet");

        const safeName = sanitizeStorageKey(file.name);
        const storagePath = `${buildingId}/belege/${fiscalYear}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("building-files")
          .upload(storagePath, file);
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase
          .from("building_files")
          .insert({
            display_name: file.name,
            file_path: storagePath,
            file_size: file.size,
            mime_type: file.type,
            building_id: buildingId,
            uploaded_by: user.id,
            management_mode: "rent",
            description: `Beleg für Wirtschaftsjahr ${fiscalYear}`,
            visible_to_users: false,
          } as any);
        if (insertError) throw insertError;

        toast.success(`„${file.name}" hochgeladen`);
        refetch();
      } catch (e: any) {
        console.error("Upload error:", e);
        toast.error("Upload fehlgeschlagen: " + (e.message || "Unbekannter Fehler"));
      } finally {
        setUploading(false);
      }
    },
    [buildingId, fiscalYear, refetch],
  );

  const handleDelete = async (fileId: string, filePath: string) => {
    if (!confirm("Beleg wirklich löschen?")) return;
    try {
      await supabase.storage.from("building-files").remove([filePath]);
      const { error } = await supabase.from("building_files").delete().eq("id", fileId);
      if (error) throw error;
      toast.success("Beleg gelöscht");
      refetch();
    } catch (e: any) {
      toast.error("Löschen fehlgeschlagen: " + e.message);
    }
  };

  const handleDownload = async (file: any) => {
    setDownloading(file.id);
    try {
      const { data, error } = await supabase.functions.invoke("get-building-file-url", {
        body: { filePath: file.file_path },
      });
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch {
      toast.error("Download fehlgeschlagen");
    } finally {
      setDownloading(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    dropped.forEach(handleUpload);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Belege für die Buchhaltung {fiscalYear ? `(${fiscalYear})` : ""}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          PDF, CAMT-XML, XLSX/CSV hochladen — werden nur abgelegt und stehen für die externe Buchung durch Claude bereit. Keine automatische Verarbeitung.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn(
            "rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
            isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
            !fiscalYear && "opacity-50 cursor-not-allowed",
          )}
          onClick={() => fiscalYear && fileInputRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setIsDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={`${ACCEPT_EXT},${ACCEPT_MIME}`}
            className="hidden"
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              selected.forEach(handleUpload);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-primary">
              <Loader2 className="h-5 w-5 animate-spin" /> Lädt hoch…
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Upload className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">Belege hier ablegen oder klicken</p>
              <p className="text-xs text-muted-foreground">PDF · CAMT-XML · XLSX · CSV (max. 50 MB)</p>
              {!fiscalYear && <p className="text-xs text-amber-600 mt-1">Bitte zuerst Wirtschaftsjahr wählen</p>}
            </div>
          )}
        </div>

        {files.length > 0 && (
          <div className="border rounded-md divide-y">
            {files.map((f: any) => (
              <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 group">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1 font-medium">{f.display_name}</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">{formatFileSize(f.file_size)}</span>
                <span className="text-xs text-muted-foreground hidden md:inline">
                  {format(new Date(f.created_at), "dd.MM.yy", { locale: de })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  onClick={() => handleDownload(f)}
                  disabled={downloading === f.id}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(f.id, f.file_path)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RentAccountingPage({ buildingId, periodId, fiscalYear }: Props) {
  const { data: building } = useQuery({
    queryKey: ["building-booking-instructions", buildingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("booking_instructions")
        .eq("id", buildingId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!buildingId,
  });

  return (
    <div className="space-y-4">
      <BookingInstructionsSection
        buildingId={buildingId}
        initialValue={(building as any)?.booking_instructions}
      />

      <RentBelegDropZone buildingId={buildingId} fiscalYear={fiscalYear} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Buchungen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Alle Buchungen der Liegenschaft im gewählten Wirtschaftsjahr. Spalte „umlagefähig" markiert,
            ob die Position auf Mieter umgelegt werden darf.
          </p>
        </CardHeader>
        <CardContent>
          <BookingsTab sharedBuildingId={buildingId} sharedPeriodId={periodId} />
        </CardContent>
      </Card>
    </div>
  );
}
