import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Search, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { CompanyFolderTree } from "./CompanyFolderTree";
import { CompanyFileList } from "./CompanyFileList";
import { CompanyFileDetail } from "./CompanyFileDetail";
import { CompanyUploadDialog } from "./CompanyUploadDialog";
import { CompanyFile } from "./types";

/**
 * Dokumentenablage der Firma RGI Immobilien. Aufbau wie im Liegenschafts-DMS:
 * links die Ordner, in der Mitte die Dateien, rechts die Details.
 */
export function DocumentsTab() {
  const isMobile = useIsMobile();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<CompanyFile | null>(null);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileView, setMobileView] = useState<"tree" | "list" | "detail">("tree");

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length === 0) return;
    setPendingFiles(dropped);
    setUploadOpen(true);
  };

  const selectFolder = (id: string | null) => {
    setCategoryId(id);
    setSelectedFile(null);
    if (isMobile) setMobileView("list");
  };

  const selectFile = (f: CompanyFile) => {
    setSelectedFile(f);
    if (isMobile) setMobileView("detail");
  };

  const openUpload = () => {
    setPendingFiles([]);
    setUploadOpen(true);
  };

  if (isMobile) {
    return (
      <div className="mt-4 flex h-[calc(100vh-280px)] flex-col">
        <div className="mb-3 flex gap-2">
          {mobileView !== "tree" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileView(mobileView === "detail" ? "list" : "tree")}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Zurück
            </Button>
          )}
          <Button size="sm" className="ml-auto" onClick={openUpload}>
            <Upload className="mr-1 h-4 w-4" /> Hochladen
          </Button>
        </div>
        <Card className="flex-1 overflow-hidden">
          {mobileView === "tree" && (
            <div className="h-full overflow-auto p-3">
              <CompanyFolderTree selectedId={categoryId} onSelect={selectFolder} />
            </div>
          )}
          {mobileView === "list" && (
            <div className="flex h-full flex-col">
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8"
                    placeholder="Suchen…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <CompanyFileList
                  categoryId={categoryId}
                  search={search}
                  selectedFileId={selectedFile?.id ?? null}
                  onSelect={selectFile}
                />
              </div>
            </div>
          )}
          {mobileView === "detail" && (
            <CompanyFileDetail file={selectedFile} onClose={() => setMobileView("list")} />
          )}
        </Card>
        <CompanyUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          initialCategoryId={categoryId}
          initialFiles={pendingFiles}
        />
      </div>
    );
  }

  return (
    <div
      className="mt-4 flex h-[calc(100vh-260px)] flex-col gap-3"
      onDragOver={(e) => {
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
      <div className="flex gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="In allen Firmendokumenten suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openUpload}>
          <Upload className="mr-2 h-4 w-4" /> Hochladen
        </Button>
      </div>

      <div
        className={cn(
          "relative grid min-h-0 flex-1 grid-cols-[260px_1fr_320px] gap-3",
          isDragging && "rounded-lg ring-2 ring-primary ring-offset-2",
        )}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/10 backdrop-blur-sm">
            <div className="text-center">
              <Upload className="mx-auto mb-2 h-12 w-12 text-primary" />
              <p className="font-medium">Dateien hier ablegen</p>
            </div>
          </div>
        )}
        <Card className="overflow-auto p-2">
          <CompanyFolderTree selectedId={categoryId} onSelect={selectFolder} />
        </Card>
        <Card className="overflow-hidden">
          <CompanyFileList
            categoryId={categoryId}
            search={search}
            selectedFileId={selectedFile?.id ?? null}
            onSelect={selectFile}
          />
        </Card>
        <Card className="overflow-hidden">
          <CompanyFileDetail file={selectedFile} onClose={() => setSelectedFile(null)} />
        </Card>
      </div>

      <CompanyUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        initialCategoryId={categoryId}
        initialFiles={pendingFiles}
      />
    </div>
  );
}
