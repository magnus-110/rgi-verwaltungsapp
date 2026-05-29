import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Upload, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { FolderTree } from "./documents/FolderTree";
import { DocumentFileList } from "./documents/DocumentFileList";
import { DocumentDetailPanel } from "./documents/DocumentDetailPanel";
import { UploadDocumentDialog } from "./documents/UploadDocumentDialog";
import { DocFile } from "./documents/types";

interface BuildingDocumentsTabProps {
  buildingId: string;
  managementMode: 'weg' | 'rent';
}

export function BuildingDocumentsTab({ buildingId, managementMode }: BuildingDocumentsTabProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileView, setMobileView] = useState<'tree' | 'list' | 'detail'>('tree');

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['stammakte-files', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['stammakte-counts', buildingId] });
    queryClient.invalidateQueries({ queryKey: ['file-versions'] });
  }, [queryClient, buildingId]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;
    setPendingFiles(droppedFiles);
    setUploadOpen(true);
  };

  const handleSelectCategory = (id: string | null) => {
    setSelectedCategoryId(id);
    setSelectedFile(null);
    if (isMobile) setMobileView('list');
  };

  const handleSelectFile = (f: DocFile) => {
    setSelectedFile(f);
    if (isMobile) setMobileView('detail');
  };

  // Mobile drill-down
  if (isMobile) {
    return (
      <div className="h-[calc(100vh-280px)] flex flex-col">
        <div className="flex gap-2 mb-3">
          {mobileView !== 'tree' && (
            <Button variant="ghost" size="sm" onClick={() =>
              setMobileView(mobileView === 'detail' ? 'list' : 'tree')
            }>
              <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
            </Button>
          )}
          <Button size="sm" onClick={() => { setPendingFiles([]); setUploadOpen(true); }} className="ml-auto">
            <Upload className="h-4 w-4 mr-1" /> Hochladen
          </Button>
        </div>
        <Card className="flex-1 overflow-hidden">
          {mobileView === 'tree' && (
            <div className="p-3 h-full overflow-auto">
              <FolderTree buildingId={buildingId} selectedCategoryId={selectedCategoryId} onSelect={handleSelectCategory} />
            </div>
          )}
          {mobileView === 'list' && (
            <div className="h-full flex flex-col">
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Suchen..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <DocumentFileList buildingId={buildingId} categoryId={selectedCategoryId} searchQuery={search}
                  selectedFileId={selectedFile?.id || null} onSelect={handleSelectFile} />
              </div>
            </div>
          )}
          {mobileView === 'detail' && (
            <DocumentDetailPanel file={selectedFile} buildingId={buildingId}
              onClose={() => setMobileView('list')} onChanged={refresh} />
          )}
        </Card>
        <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} buildingId={buildingId}
          managementMode={managementMode} initialCategoryId={selectedCategoryId}
          initialFiles={pendingFiles} onUploaded={refresh} />
      </div>
    );
  }

  // Desktop: 3-column layout
  return (
    <div
      className="h-[calc(100vh-260px)] flex flex-col gap-3"
      onDragOver={(e) => {
        // Nur reagieren, wenn echte Dateien vom Betriebssystem gezogen werden,
        // nicht bei internem Drag&Drop zwischen Ordnern.
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        handleDrop(e);
      }}

    >
      {/* Toolbar */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="In allen Dokumenten suchen (Name, Beschreibung, Volltext)..."
            value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Button onClick={() => { setPendingFiles([]); setUploadOpen(true); }}>
          <Upload className="h-4 w-4 mr-2" /> Hochladen
        </Button>
      </div>

      {/* 3-column layout */}
      <div className={cn(
        "grid grid-cols-[260px_1fr_320px] gap-3 flex-1 min-h-0 relative",
        isDragging && "ring-2 ring-primary ring-offset-2 rounded-lg"
      )}>
        {isDragging && (
          <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm rounded-lg z-10 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Upload className="h-12 w-12 mx-auto mb-2 text-primary" />
              <p className="font-medium">Dateien hier ablegen</p>
            </div>
          </div>
        )}
        <Card className="overflow-auto p-2">
          <FolderTree buildingId={buildingId} selectedCategoryId={selectedCategoryId} onSelect={handleSelectCategory} />
        </Card>
        <Card className="overflow-hidden">
          <DocumentFileList buildingId={buildingId} categoryId={selectedCategoryId} searchQuery={search}
            selectedFileId={selectedFile?.id || null} onSelect={handleSelectFile} />
        </Card>
        <Card className="overflow-hidden">
          <DocumentDetailPanel file={selectedFile} buildingId={buildingId}
            onClose={() => setSelectedFile(null)} onChanged={refresh} />
        </Card>
      </div>

      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} buildingId={buildingId}
        managementMode={managementMode} initialCategoryId={selectedCategoryId}
        initialFiles={pendingFiles} onUploaded={refresh} />
    </div>
  );
}
