import React, { useState } from 'react';
import { useUpload } from '@/contexts/UploadContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  AlertCircle,
  Loader2,
  Upload,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function UploadProgressWidget() {
  const { uploads, removeUpload, clearCompleted, hasActiveUploads } = useUpload();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Don't render if no uploads
  if (uploads.length === 0) return null;

  const activeCount = uploads.filter(u => 
    u.status === 'queued' || u.status === 'uploading' || u.status === 'processing'
  ).length;
  
  const completedCount = uploads.filter(u => u.status === 'done').length;
  const errorCount = uploads.filter(u => u.status === 'error').length;

  // Calculate overall progress
  const overallProgress = uploads.length > 0
    ? Math.round(uploads.reduce((acc, u) => acc + u.progress, 0) / uploads.length)
    : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Upload className="h-4 w-4 text-muted-foreground" />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'done':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusText = (upload: typeof uploads[0]) => {
    switch (upload.status) {
      case 'queued':
        return 'Wartend...';
      case 'uploading':
        return 'Hochladen...';
      case 'processing':
        // Show detailed progress for batch processing
        if (upload.totalPages && upload.totalPages > 50 && upload.processingPhase === 'ocr') {
          return `OCR: ${upload.processedPages || 0}/${upload.totalPages} Seiten`;
        }
        return upload.step || 'Verarbeitung...';
      case 'done':
        return 'Fertig';
      case 'error':
        return upload.error || 'Fehler';
      default:
        return '';
    }
  };

  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="fixed bottom-4 right-4 z-50 shadow-lg"
        onClick={() => setIsVisible(true)}
      >
        <Upload className="h-4 w-4 mr-2" />
        {activeCount > 0 ? `${activeCount} aktiv` : `${uploads.length} Uploads`}
      </Button>
    );
  }

  // Minimized view
  if (isMinimized) {
    return (
      <div 
        className="fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsMinimized(false)}
      >
        <Upload className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{activeCount > 0 ? activeCount : uploads.length}</span>
        <div className="w-20">
          <Progress value={overallProgress} className="h-2" />
        </div>
        <span className="text-xs text-muted-foreground">{overallProgress}%</span>
        <Maximize2 className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  // Expanded view
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-background border rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">
            Uploads
            {activeCount > 0 && (
              <span className="text-muted-foreground ml-1">({activeCount} aktiv)</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsMinimized(true)}
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsVisible(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Upload List */}
      <ScrollArea className="max-h-64">
        <div className="p-2 space-y-2">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className={cn(
                "p-3 rounded-md border bg-card",
                upload.status === 'error' && "border-destructive/50 bg-destructive/5",
                upload.status === 'done' && "border-green-500/50 bg-green-500/5"
              )}
            >
              <div className="flex items-start gap-3">
                {getStatusIcon(upload.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{upload.fileName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {upload.buildingName || (upload.category === 'general' ? 'Allgemein' : 'Gebäude')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {getStatusText(upload)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-50 hover:opacity-100"
                  onClick={() => removeUpload(upload.id)}
                  title="Entfernen"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              
              {(upload.status === 'uploading' || upload.status === 'processing') && (
                <div className="mt-2">
                  <Progress value={upload.progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground text-right mt-1">{upload.progress}%</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer with actions */}
      {(completedCount > 0 || errorCount > 0) && (
        <div className="px-4 py-2 border-t bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={clearCompleted}
          >
            Abgeschlossene entfernen
          </Button>
        </div>
      )}
    </div>
  );
}
