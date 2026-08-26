import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  uploadCompanyFile,
  useCompanyFolders,
  useInvalidateCompanyDocuments,
} from "@/hooks/useCompanyDocuments";
import { formatBytes } from "./types";

const NO_FOLDER = "__none__";
const MAX_BYTES = 50 * 1024 * 1024;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCategoryId: string | null;
  initialFiles: File[];
}

export function CompanyUploadDialog({
  open,
  onOpenChange,
  initialCategoryId,
  initialFiles,
}: Props) {
  const { data: folders = [] } = useCompanyFolders();
  const invalidate = useInvalidateCompanyDocuments();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState<string>(NO_FOLDER);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFiles(initialFiles);
    setCategoryId(initialCategoryId ?? NO_FOLDER);
    setDescription("");
  }, [open, initialFiles, initialCategoryId]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const tooBig = picked.filter((f) => f.size > MAX_BYTES);
    if (tooBig.length) {
      toast.error(`Zu groß (max. 50 MB): ${tooBig.map((f) => f.name).join(", ")}`);
    }
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_BYTES)]);
  };

  const submit = async () => {
    if (files.length === 0) return;
    setBusy(true);
    let ok = 0;
    try {
      for (const file of files) {
        await uploadCompanyFile({
          file,
          categoryId: categoryId === NO_FOLDER ? null : categoryId,
          description,
        });
        ok += 1;
      }
      toast.success(`${ok} Dokument(e) hochgeladen`);
      invalidate();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(
        ok > 0
          ? `${ok} hochgeladen, dann abgebrochen: ${e.message}`
          : (e.message ?? "Hochladen fehlgeschlagen"),
      );
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dokumente hochladen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <Button variant="outline" className="w-full gap-2" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Dateien auswählen
          </Button>

          {files.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Ordner</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FOLDER}>Ohne Ordner</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Beschreibung (optional)</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={busy || files.length === 0}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lädt hoch…
              </>
            ) : (
              "Hochladen"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
