import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, User, Upload, Loader2, FileText, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface FileItem {
  id: string;
  display_name: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  description: string | null;
  visible_to_users: boolean;
  created_at: string;
  category_id: string | null;
}

interface Category {
  id: string;
  name: string;
  color: string | null;
}

interface FileDropCardProps {
  title: string;
  subtitle?: string;
  icon: "building" | "user";
  buildingId: string;
  assignedUserId: string | null;
  categoryId: string | null;
  visibleToUsers: boolean;
  description: string;
  managementMode: "weg" | "rent";
  files: FileItem[];
  categories: Category[];
  fullWidth?: boolean;
  onFileUploaded: () => void;
  onDelete: (fileId: string, filePath: string) => void;
  onToggleVisibility?: (fileId: string, visible: boolean) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropCard({
  title,
  subtitle,
  icon,
  buildingId,
  assignedUserId,
  categoryId,
  visibleToUsers,
  description,
  managementMode,
  files,
  categories,
  fullWidth = false,
  onFileUploaded,
  onDelete,
}: FileDropCardProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleUpload = useCallback(async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Datei darf maximal 50 MB groß sein");
      return;
    }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      const ext = file.name.split(".").pop();
      const storagePath = `${buildingId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("building-files")
        .upload(storagePath, file);
      if (uploadError) throw uploadError;

      const { data: insertedFile, error: insertError } = await supabase
        .from("building_files")
        .insert({
          display_name: file.name,
          file_path: storagePath,
          file_size: file.size,
          mime_type: file.type,
          category_id: categoryId || null,
          building_id: buildingId,
          assigned_user_id: assignedUserId,
          uploaded_by: user.id,
          management_mode: managementMode,
          description: description || null,
          visible_to_users: visibleToUsers,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      toast.success(`„${file.name}" hochgeladen`);

      // OCR in background
      const ocrTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
      if (insertedFile && ocrTypes.includes(file.type)) {
        supabase.functions.invoke("process-building-file", {
          body: { fileId: insertedFile.id },
        }).catch(console.error);
      }

      onFileUploaded();
    } catch (e: any) {
      console.error("Upload error:", e);
      toast.error("Upload fehlgeschlagen: " + (e.message || "Unbekannter Fehler"));
    } finally {
      setUploading(false);
    }
  }, [buildingId, assignedUserId, categoryId, visibleToUsers, description, managementMode, onFileUploaded]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach(handleUpload);
  };

  const handleClick = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    selected.forEach(handleUpload);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = async (file: FileItem) => {
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

  const getCategoryInfo = (catId: string | null) => {
    if (!catId) return null;
    return categories.find((c) => c.id === catId);
  };

  const IconComp = icon === "building" ? Building2 : User;

  return (
    <Card
      className={`relative transition-all duration-300 overflow-hidden ${fullWidth ? "col-span-full" : ""} ${
        isDragOver
          ? "border-primary border-2 bg-primary/5 shadow-xl scale-[1.01]"
          : "border-border hover:border-primary/30 hover:shadow-md"
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop zone / header */}
      <div
        className="p-5 sm:p-6 cursor-pointer flex items-center gap-4"
        onClick={handleClick}
      >
        <div className={`rounded-xl p-3 ${icon === "building" ? "bg-primary/10" : "bg-muted"}`}>
          <IconComp className={`w-6 h-6 ${icon === "building" ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate">{title}</p>
          {subtitle && <p className="text-sm text-muted-foreground truncate mt-0.5">{subtitle}</p>}
        </div>
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        ) : (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 border border-dashed border-border rounded-lg px-3 py-2">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Ablegen / Klicken</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
        onChange={handleFileSelect}
      />

      {/* File list */}
      {files.length > 0 && (
        <div className="border-t px-5 sm:px-6 pb-4 pt-3 space-y-1">
          {files.map((file) => {
            const cat = getCategoryInfo(file.category_id);
            return (
              <div
                key={file.id}
                className="flex items-center gap-2 py-2 text-sm group rounded-md hover:bg-muted/50 px-2 -mx-2 transition-colors"
              >
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1 font-medium">{file.display_name}</span>
                {cat && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                    {cat.name}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {formatFileSize(file.file_size)}
                </span>
                <span className="text-xs text-muted-foreground hidden md:inline">
                  {format(new Date(file.created_at), "dd.MM.yy", { locale: de })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                  disabled={downloading === file.id}
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(file.id, file.file_path); }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state for tiles with no files */}
      {files.length === 0 && (
        <div className="border-t px-5 sm:px-6 py-6 text-center">
          <p className="text-sm text-muted-foreground">Keine Dokumente – Datei hierher ziehen</p>
        </div>
      )}
    </Card>
  );
}
