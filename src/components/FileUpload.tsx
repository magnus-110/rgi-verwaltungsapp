import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Upload, FileText, Image as ImageIcon, File } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FilePreview {
  file: File;
  preview?: string;
  id: string;
}

interface FileUploadProps {
  onFilesChange: (files: { name: string; path: string; size: number; type: string }[]) => void;
  maxFiles?: number;
  acceptedTypes?: string[];
  bucketName: string;
}

export const FileUpload = ({ onFilesChange, maxFiles = 5, acceptedTypes = ["image/*", ".pdf", ".doc", ".docx", ".txt"], bucketName }: FileUploadProps) => {
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    
    if (files.length + selectedFiles.length > maxFiles) {
      toast.error(`Maximal ${maxFiles} Dateien erlaubt`);
      return;
    }

    const newFiles: FilePreview[] = selectedFiles.map(file => ({
      file,
      id: Math.random().toString(36).substring(7),
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));

    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const updatedFiles = prev.filter(f => f.id !== id);
      const file = prev.find(f => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return updatedFiles;
    });
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      onFilesChange([]);
      return;
    }

    setUploading(true);
    const uploadedFiles: { name: string; path: string; size: number; type: string }[] = [];

    try {
      for (const filePreview of files) {
        const fileExt = filePreview.file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(filePath, filePreview.file);

        if (uploadError) throw uploadError;

        uploadedFiles.push({
          name: filePreview.file.name,
          path: filePath,
          size: filePreview.file.size,
          type: filePreview.file.type
        });
      }

      onFilesChange(uploadedFiles);
      toast.success("Dateien erfolgreich hochgeladen");
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error("Fehler beim Hochladen der Dateien");
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    if (type.includes('pdf')) return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          ref={fileInputRef}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={files.length >= maxFiles || uploading}
        >
          <Upload className="h-4 w-4 mr-2" />
          Dateien auswählen
        </Button>
        <span className="text-sm text-muted-foreground">
          {files.length}/{maxFiles} Dateien
        </span>
      </div>

      {files.length > 0 && (
        <div className="grid gap-2">
          {files.map((filePreview) => (
            <div key={filePreview.id} className="flex items-center gap-3 p-3 border rounded-lg">
              {filePreview.preview ? (
                <img 
                  src={filePreview.preview} 
                  alt="Preview" 
                  className="h-12 w-12 object-cover rounded"
                />
              ) : (
                <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                  {getFileIcon(filePreview.file.type)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{filePreview.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(filePreview.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(filePreview.id)}
                disabled={uploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <Button
          type="button"
          onClick={uploadFiles}
          disabled={uploading}
          className="w-full"
        >
          {uploading ? "Hochladen..." : "Dateien hochladen"}
        </Button>
      )}
    </div>
  );
};