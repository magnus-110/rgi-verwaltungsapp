import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLink, FileText, Receipt, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { companyFileUrl, useCompanyFiles, useDeleteCompanyFiles } from "@/hooks/useCompanyDocuments";
import { CompanyFile, formatBytes } from "./types";

interface Props {
  categoryId: string | null;
  search: string;
  selectedFileId: string | null;
  onSelect: (file: CompanyFile) => void;
}

export function CompanyFileList({ categoryId, search, selectedFileId, onSelect }: Props) {
  const { data: files = [], isLoading } = useCompanyFiles(categoryId, search);
  const removeFiles = useDeleteCompanyFiles();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allChecked = files.length > 0 && files.every((f) => checked.has(f.id));

  const openFile = async (file: CompanyFile) => {
    try {
      window.open(await companyFileUrl(file), "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message ?? "Datei konnte nicht geöffnet werden");
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Laden…</div>;
  }

  if (files.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <FileText className="mx-auto mb-2 h-10 w-10 opacity-30" />
        {search.trim() ? (
          <>Keine Dokumente für „{search.trim()}" gefunden.</>
        ) : (
          <>
            Keine Dokumente in diesem Ordner.
            <p className="mt-1 text-xs">Dateien per Drag &amp; Drop hierher ziehen.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allChecked}
            onCheckedChange={() =>
              setChecked(allChecked ? new Set() : new Set(files.map((f) => f.id)))
            }
            aria-label="Alle auswählen"
          />
          <span className="text-xs text-muted-foreground">
            {checked.size > 0 ? `${checked.size} ausgewählt` : `${files.length} Dokument(e)`}
          </span>
        </div>
        {checked.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Löschen
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {files.map((f) => (
          <div
            key={f.id}
            draggable
            onDragStart={(e) => {
              // Gehoert die Zeile zur Auswahl, wandert die ganze Auswahl mit.
              const ids = checked.has(f.id) && checked.size > 0 ? Array.from(checked) : [f.id];
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("application/x-dms-file-ids", JSON.stringify(ids));
              e.dataTransfer.setData("text/plain", ids.join(","));
            }}
            onClick={() => onSelect(f)}
            onDoubleClick={() => openFile(f)}
            className={cn(
              "cursor-pointer border-b p-3 transition-colors hover:bg-accent",
              selectedFileId === f.id && "bg-accent",
              checked.has(f.id) && "bg-accent/60",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center pt-1" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={checked.has(f.id)}
                  onCheckedChange={() => toggle(f.id)}
                  aria-label="Dokument auswählen"
                />
              </div>
              <div className="flex-shrink-0 rounded bg-muted p-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="flex-1 truncate text-sm font-medium">{f.display_name}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    title="In neuem Tab öffnen"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFile(f);
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {f.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{f.description}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{formatBytes(f.file_size)}</span>
                  <span>·</span>
                  <span>{format(new Date(f.updated_at), "dd.MM.yyyy", { locale: de })}</span>
                  {f.source === "invoice" && (
                    <Badge variant="outline" className="h-4 gap-1 px-1.5 text-[10px]">
                      <Receipt className="h-3 w-3" /> Rechnung
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{checked.size} Dokument(e) löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Dokumente werden in den Papierkorb verschoben und sind nicht mehr sichtbar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                removeFiles.mutate(Array.from(checked), {
                  onSuccess: () => {
                    setChecked(new Set());
                    setConfirmOpen(false);
                  },
                });
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
