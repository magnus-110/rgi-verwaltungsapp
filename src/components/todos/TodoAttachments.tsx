import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Upload, FileText, Image, X, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUpdateTodo, Todo } from "@/hooks/useTodos";

interface Attachment {
  name: string;
  path: string;
  size: number;
  type: string;
}

interface TodoAttachmentsProps {
  todo: Todo;
  readOnly?: boolean;
}

export function TodoAttachments({ todo, readOnly = false }: TodoAttachmentsProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateTodo = useUpdateTodo();

  const attachments: Attachment[] = Array.isArray(todo.attachments) ? todo.attachments : [];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAttachments: Attachment[] = [];

    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${todo.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('todo-attachments')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        newAttachments.push({
          name: file.name,
          path: fileName,
          size: file.size,
          type: file.type,
        });
      }

      // Update todo with new attachments
      updateTodo.mutate({
        id: todo.id,
        attachments: [...attachments, ...newAttachments],
      });

      toast({ title: 'Dateien hochgeladen', description: `${newAttachments.length} Datei(en) erfolgreich hochgeladen.` });
    } catch (error: any) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async (attachmentToRemove: Attachment) => {
    try {
      // Delete from storage
      await supabase.storage
        .from('todo-attachments')
        .remove([attachmentToRemove.path]);

      // Update todo
      updateTodo.mutate({
        id: todo.id,
        attachments: attachments.filter(a => a.path !== attachmentToRemove.path),
      });

      toast({ title: 'Datei entfernt' });
    } catch (error: any) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    }
  };

  const handleOpen = async (attachment: Attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from('todo-attachments')
        .createSignedUrl(attachment.path, 3600); // 1 hour

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error: any) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">
            Anhänge {attachments.length > 0 && <span className="text-muted-foreground">({attachments.length})</span>}
          </h4>
        </div>
        
        {!readOnly && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              Hochladen
            </Button>
          </>
        )}
      </div>

      {/* Attachments list */}
      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 bg-muted/50 rounded-md group"
            >
              {getFileIcon(attachment.type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attachment.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleOpen(attachment)}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemove(attachment)}
                >
                  <X className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          Keine Anhänge
        </p>
      )}
    </div>
  );
}

// Inline attachment creator for the todo dialog
interface InlineAttachmentCreatorProps {
  files: File[];
  onChange: (files: File[]) => void;
}

export function InlineAttachmentCreator({ files, onChange }: InlineAttachmentCreatorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    onChange([...files, ...Array.from(selectedFiles)]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Anhänge</label>
      
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        className="w-full"
      >
        <Upload className="h-4 w-4 mr-2" />
        Dateien auswählen
      </Button>

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
              <FileText className="h-4 w-4" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => removeFile(index)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
