import React, { useState, useRef, useCallback } from "react";
import * as tus from 'tus-js-client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  FileText,
  X,
  Search,
  Check,
  Loader2,
  AlertTriangle,
  Files,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/contexts/UploadContext";
import { cn } from "@/lib/utils";

// Supabase URL for TUS uploads
const SUPABASE_URL = "https://eebphowrbarzawwixqcc.supabase.co";

// Threshold for using resumable upload (10 MB)
const RESUMABLE_THRESHOLD = 10 * 1024 * 1024;

// Max file size (1 GB)
const MAX_FILE_SIZE = 1024 * 1024 * 1024;

interface Building {
  id: string;
  name: string;
  address: string;
  building_code: string;
}

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildings: Building[];
}

interface SelectedFile {
  id: string;
  file: File;
}

export function UploadDialog({ open, onOpenChange, buildings }: UploadDialogProps) {
  const { toast } = useToast();
  const { addUpload, updateUpload } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [category, setCategory] = useState<'general' | 'building'>('general');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const filteredBuildings = buildings.filter(
    (b) =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const addFiles = useCallback((files: FileList) => {
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      toast({
        title: "Ungültiges Dateiformat",
        description: "Bitte laden Sie nur PDF-Dateien hoch.",
        variant: "destructive",
      });
      return;
    }

    // Check file size
    const oversizedFiles = pdfFiles.filter(f => f.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      toast({
        title: "Datei zu groß",
        description: `Maximale Dateigröße: 1 GB. ${oversizedFiles.map(f => f.name).join(', ')} überschreitet das Limit.`,
        variant: "destructive",
      });
      return;
    }

    if (pdfFiles.length < files.length) {
      toast({
        title: "Einige Dateien übersprungen",
        description: "Nur PDF-Dateien werden akzeptiert.",
        variant: "default",
      });
    }

    const newFiles: SelectedFile[] = pdfFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
    }));

    setSelectedFiles(prev => [...prev, ...newFiles]);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const resetState = () => {
    setCategory('general');
    setSelectedBuildingId(null);
    setSearchQuery("");
    setSelectedFiles([]);
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Sanitize filename for Supabase Storage (remove special chars, spaces, umlauts)
  const sanitizeFileName = (name: string): string => {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, ''); // Trim leading/trailing underscores
  };

  // Resumable upload using TUS protocol for large files
  const uploadWithTus = async (
    file: File, 
    filePath: string, 
    onProgress: (progress: number) => void
  ): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('Nicht authentifiziert');
    }

    return new Promise((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          'x-upsert': 'false',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: 'building-documents',
          objectName: filePath,
          contentType: 'application/pdf',
          cacheControl: '3600',
        },
        chunkSize: 6 * 1024 * 1024, // 6 MB chunks
        onError: (error) => {
          console.error('TUS upload error:', error);
          reject(new Error(`Upload fehlgeschlagen: ${error.message}`));
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
          onProgress(percentage);
        },
        onSuccess: () => {
          resolve();
        },
      });

      // Check for previous uploads to resume
      upload.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      });
    });
  };

  // Standard upload for smaller files
  const uploadStandard = async (file: File, filePath: string): Promise<void> => {
    const { error: uploadError } = await supabase
      .storage
      .from('building-documents')
      .upload(filePath, file);

    if (uploadError) {
      throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`);
    }
  };

  const uploadSingleFile = async (selectedFile: SelectedFile, building: Building | undefined) => {
    const isLargeFile = selectedFile.file.size > RESUMABLE_THRESHOLD;
    
    const uploadId = addUpload({
      fileName: selectedFile.file.name,
      fileSize: selectedFile.file.size,
      category,
      buildingId: selectedBuildingId,
      buildingName: building?.name,
      status: 'uploading',
      progress: 0,
      step: isLargeFile ? 'Großer Upload wird vorbereitet...' : 'Wird hochgeladen...',
    });

    try {
      const timestamp = Date.now();
      const sanitizedName = sanitizeFileName(selectedFile.file.name);
      const fileName = `${timestamp}_${sanitizedName}`;
      const filePath = category === 'building' 
        ? `buildings/${selectedBuildingId}/${fileName}`
        : `general/${fileName}`;

      // Use TUS for large files, standard upload for small files
      if (isLargeFile) {
        updateUpload(uploadId, { step: 'Wird hochgeladen (Resumable)...' });
        
        await uploadWithTus(selectedFile.file, filePath, (progress) => {
          // Map 0-100% to 0-40% of total progress (upload phase)
          const mappedProgress = Math.round(progress * 0.4);
          updateUpload(uploadId, { 
            progress: mappedProgress, 
            step: `Wird hochgeladen... ${progress}%` 
          });
        });
      } else {
        updateUpload(uploadId, { progress: 20, step: 'Datei wird hochgeladen...' });
        await uploadStandard(selectedFile.file, filePath);
      }

      updateUpload(uploadId, { progress: 40, step: 'Dokument wird registriert...' });

      const { data: docRecord, error: insertError } = await supabase
        .from('building_documents')
        .insert({
          building_id: category === 'building' ? selectedBuildingId : null,
          category,
          file_name: selectedFile.file.name,
          file_path: filePath,
          file_size: selectedFile.file.size,
          status: 'processing',
          processing_progress: 0,
          processing_step: 'Wartend auf Verarbeitung...',
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Dokument konnte nicht gespeichert werden: ${insertError.message}`);
      }

      // Update upload with document ID for realtime tracking
      updateUpload(uploadId, { 
        documentId: docRecord.id, 
        progress: 50, 
        status: 'processing',
        step: 'Verarbeitung gestartet...' 
      });

      // Invoke processing in background - don't await
      supabase.functions.invoke('process-document', {
        body: {
          documentId: docRecord.id,
          filePath,
          buildingId: category === 'building' ? selectedBuildingId : null,
          category,
        },
      }).then(({ error }) => {
        if (error) {
          console.error('Processing error:', error);
          updateUpload(uploadId, { 
            status: 'error', 
            error: 'Verarbeitungsfehler',
            step: 'Fehler bei der Verarbeitung'
          });
        }
      }).catch((error) => {
        console.error('Processing invoke error:', error);
        updateUpload(uploadId, { 
          status: 'error', 
          error: 'Verarbeitungsfehler',
          step: 'Fehler bei der Verarbeitung'
        });
      });

    } catch (error) {
      console.error('Upload error:', error);
      updateUpload(uploadId, { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
        step: 'Upload fehlgeschlagen'
      });
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    if (category === 'building' && !selectedBuildingId) {
      toast({
        title: "Kein Gebäude ausgewählt",
        description: "Bitte wählen Sie zuerst ein Gebäude aus.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);
    const filesToUpload = [...selectedFiles];

    // Close dialog immediately so user can continue working
    resetState();
    onOpenChange(false);

    // Upload all files in parallel
    await Promise.all(
      filesToUpload.map(file => uploadSingleFile(file, selectedBuilding))
    );
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);
  const totalSize = selectedFiles.reduce((acc, f) => acc + f.file.size, 0);
  const hasLargeFiles = selectedFiles.some(f => f.file.size > 100 * 1024 * 1024);
  const hasVeryLargeFiles = selectedFiles.some(f => f.file.size > 300 * 1024 * 1024);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dokumente hochladen</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Category Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Kategorie</Label>
            <RadioGroup
              value={category}
              onValueChange={(v) => setCategory(v as 'general' | 'building')}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="general" />
                <span className="text-sm">Allgemeines Wissen</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="building" />
                <span className="text-sm">Gebäude-spezifisch</span>
              </label>
            </RadioGroup>
          </div>

          {/* Building Selection */}
          {category === 'building' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Gebäude auswählen</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Gebäude suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <ScrollArea className="h-[140px] border rounded-md">
                <div className="p-1">
                  {filteredBuildings.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Keine Gebäude gefunden
                    </p>
                  ) : (
                    filteredBuildings.map((building) => (
                      <button
                        key={building.id}
                        onClick={() => setSelectedBuildingId(building.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 rounded text-left text-sm transition-colors",
                          selectedBuildingId === building.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        )}
                      >
                        <span className="flex-1 truncate">{building.name}</span>
                        {selectedBuildingId === building.id && (
                          <Check className="h-4 w-4 flex-shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
              {selectedBuilding && (
                <p className="text-xs text-muted-foreground">
                  Ausgewählt: {selectedBuilding.name}
                </p>
              )}
            </div>
          )}

          {/* Info about multiple documents */}
          {category === 'building' && selectedBuildingId && (
            <Alert className="border-blue-500/50 bg-blue-50 dark:bg-blue-950/20">
              <Files className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700 dark:text-blue-300 text-xs">
                Sie können mehrere Dokumente für dieses Gebäude hochladen.
              </AlertDescription>
            </Alert>
          )}

          {/* Warning for large files */}
          {hasLargeFiles && (
            <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs">
                {hasVeryLargeFiles ? (
                  <>
                    Sehr große Dateien (&gt;300MB) werden in Teilen hochgeladen. 
                    Dies kann <strong>mehrere Minuten</strong> dauern. Der Upload kann bei Verbindungsabbruch fortgesetzt werden.
                  </>
                ) : (
                  <>
                    Große Dateien (&gt;100MB) werden in Teilen hochgeladen. 
                    Dies kann einige Minuten dauern.
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
              isUploading && "pointer-events-none opacity-50"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">PDFs hier ablegen</p>
            <p className="text-xs text-muted-foreground mt-1">
              oder klicken zum Auswählen (max. 1 GB pro Datei)
            </p>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Ausgewählte Dateien ({selectedFiles.length})
                </Label>
                <span className="text-xs text-muted-foreground">
                  {(totalSize / 1024 / 1024).toFixed(2)} MB gesamt
                </span>
              </div>
              <ScrollArea className="max-h-[120px] border rounded-md">
                <div className="p-2 space-y-1">
                  {selectedFiles.map((sf) => (
                    <div
                      key={sf.id}
                      className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm"
                    >
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="flex-1 truncate">{sf.file.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {sf.file.size > 1024 * 1024 * 1024 
                          ? `${(sf.file.size / 1024 / 1024 / 1024).toFixed(2)} GB`
                          : `${(sf.file.size / 1024 / 1024).toFixed(1)} MB`
                        }
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(sf.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Upload Button */}
          <Button
            onClick={handleUpload}
            disabled={
              selectedFiles.length === 0 ||
              isUploading ||
              (category === 'building' && !selectedBuildingId)
            }
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird gestartet...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {selectedFiles.length > 1 
                  ? `${selectedFiles.length} Dokumente hochladen`
                  : 'Hochladen'
                }
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
