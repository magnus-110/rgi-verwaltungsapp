import React, { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, AlertTriangle, CheckCircle, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DocumentInfo {
  id: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  page_count: number | null;
  file_name: string;
  created_at: string;
  error_message: string | null;
}

interface DocumentUploadProps {
  category: 'building' | 'general';
  buildingId: string | null;
  buildingName?: string;
  existingDocument: DocumentInfo | null;
  onDocumentUploaded: () => void;
}

export function DocumentUpload({
  category,
  buildingId,
  buildingName,
  existingDocument,
  onDocumentUploaded,
}: DocumentUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        setSelectedFile(file);
      } else {
        toast({
          title: "Ungültiges Dateiformat",
          description: "Bitte laden Sie nur PDF-Dateien hoch.",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        setSelectedFile(file);
      } else {
        toast({
          title: "Ungültiges Dateiformat",
          description: "Bitte laden Sie nur PDF-Dateien hoch.",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (category === 'building' && !buildingId) {
      toast({
        title: "Kein Gebäude ausgewählt",
        description: "Bitte wählen Sie zuerst ein Gebäude aus.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadStatus('uploading');
    setUploadProgress(0);

    try {
      // Generate unique file path
      const timestamp = Date.now();
      const fileName = `${timestamp}_${selectedFile.name}`;
      const filePath = category === 'building' 
        ? `buildings/${buildingId}/${fileName}`
        : `general/${fileName}`;

      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 60));
      }, 200);

      // Upload file to storage
      const { error: uploadError } = await supabase
        .storage
        .from('building-documents')
        .upload(filePath, selectedFile);

      clearInterval(progressInterval);

      if (uploadError) {
        throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`);
      }

      setUploadProgress(70);

      // Create document record
      const { data: docRecord, error: insertError } = await supabase
        .from('building_documents')
        .insert({
          building_id: category === 'building' ? buildingId : null,
          category,
          file_name: selectedFile.name,
          file_path: filePath,
          file_size: selectedFile.size,
          status: 'processing',
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Dokument konnte nicht gespeichert werden: ${insertError.message}`);
      }

      setUploadProgress(80);
      setUploadStatus('processing');

      // Trigger processing via edge function
      const { error: processError } = await supabase.functions.invoke('process-document', {
        body: {
          documentId: docRecord.id,
          filePath,
          buildingId: category === 'building' ? buildingId : null,
          category,
        },
      });

      if (processError) {
        console.error('Processing error:', processError);
        // Don't throw - processing happens async
      }

      setUploadProgress(100);
      setUploadStatus('success');

      toast({
        title: "Dokument hochgeladen",
        description: "Das Dokument wird jetzt verarbeitet. Dies kann einige Minuten dauern.",
      });

      setSelectedFile(null);
      onDocumentUploaded();

      // Reset after delay
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadProgress(0);
      }, 3000);

    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
      toast({
        title: "Fehler beim Hochladen",
        description: error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          {category === 'building' 
            ? `Dokument hochladen${buildingName ? ` für ${buildingName}` : ''}`
            : 'Allgemeines Dokument hochladen'
          }
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning if replacing existing document */}
        {existingDocument && existingDocument.status === 'ready' && (
          <Alert variant="default" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-700 dark:text-yellow-300">
              Es existiert bereits ein Dokument für dieses Gebäude ({existingDocument.page_count} Seiten). 
              Ein neues Dokument wird das bestehende ersetzen.
            </AlertDescription>
          </Alert>
        )}

        {/* Processing indicator for existing document */}
        {existingDocument && existingDocument.status === 'processing' && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Ein Dokument wird gerade verarbeitet. Bitte warten Sie, bis die Verarbeitung abgeschlossen ist.
            </AlertDescription>
          </Alert>
        )}

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragging 
              ? 'border-primary bg-primary/5' 
              : 'border-muted-foreground/25 hover:border-primary hover:bg-muted/50'
            }
            ${isUploading ? 'pointer-events-none opacity-50' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div className="text-left">
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  clearSelectedFile();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">PDF hier ablegen</p>
              <p className="text-sm text-muted-foreground">
                oder klicken zum Auswählen
              </p>
            </>
          )}
        </div>

        {/* Upload progress */}
        {uploadStatus !== 'idle' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                {uploadStatus === 'uploading' && 'Wird hochgeladen...'}
                {uploadStatus === 'processing' && 'Wird verarbeitet mit Mistral AI...'}
                {uploadStatus === 'success' && 'Erfolgreich hochgeladen!'}
                {uploadStatus === 'error' && 'Fehler beim Hochladen'}
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}

        {/* Upload button */}
        {selectedFile && uploadStatus === 'idle' && (
          <Button
            onClick={handleUpload}
            disabled={isUploading || (category === 'building' && !buildingId)}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird hochgeladen...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Dokument hochladen
              </>
            )}
          </Button>
        )}

        {/* Current document info */}
        {existingDocument && existingDocument.status === 'ready' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted rounded-lg">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>
              Aktuelles Dokument: {existingDocument.file_name} ({existingDocument.page_count} Seiten)
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
