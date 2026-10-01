import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileText, Mail, PenLine, X } from "lucide-react";
import { toast } from "sonner";
import {
  companyFileUrl,
  useCompanyFolders,
  useInvalidateCompanyDocuments,
  useUpdateCompanyFile,
} from "@/hooks/useCompanyDocuments";
import { CompanyFile, companyFileBucket, formatBytes } from "./types";
import { SignPdfDialog } from "@/components/documents/SignPdfDialog";
import { saveSignedBuildingFile } from "@/lib/documentSigning";
import { useComposeEmail } from "@/contexts/ComposeEmailContext";

const NO_FOLDER = "__none__";

interface Props {
  file: CompanyFile | null;
  onClose: () => void;
}

export function CompanyFileDetail({ file, onClose }: Props) {
  const { data: folders = [] } = useCompanyFolders();
  const update = useUpdateCompanyFile();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NO_FOLDER);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const invalidate = useInvalidateCompanyDocuments();
  const { openCompose } = useComposeEmail();

  useEffect(() => {
    setName(file?.display_name ?? "");
    setDescription(file?.description ?? "");
    setCategoryId(file?.category_id ?? NO_FOLDER);
  }, [file]);

  if (!file) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
        <FileText className="mb-2 h-10 w-10 opacity-30" />
        Kein Dokument ausgewählt.
      </div>
    );
  }

  const dirty =
    name !== file.display_name ||
    (description || "") !== (file.description || "") ||
    categoryId !== (file.category_id ?? NO_FOLDER);

  const save = () =>
    update.mutate(
      {
        id: file.id,
        patch: {
          display_name: name.trim() || file.display_name,
          description: description.trim() || null,
          category_id: categoryId === NO_FOLDER ? null : categoryId,
        },
      },
      { onSuccess: () => toast.success("Gespeichert") },
    );

  const open = async () => {
    try {
      window.open(await companyFileUrl(file), "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message ?? "Datei konnte nicht geöffnet werden");
    }
  };

  const isPdfFile =
    (file.mime_type || "").toLowerCase().includes("pdf") || /\.pdf$/i.test(file.display_name || file.file_path);

  const openSign = async () => {
    try {
      setSignUrl(await companyFileUrl(file));
    } catch (e: any) {
      toast.error(e.message ?? "Datei konnte nicht geöffnet werden");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="truncate text-sm font-semibold">Details</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <Label className="text-xs text-muted-foreground">Name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Beschreibung</Label>
          <Textarea
            className="mt-1"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

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

        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Größe: {formatBytes(file.file_size)}</p>
          {file.mime_type && <p>Typ: {file.mime_type}</p>}
        </div>

        {isPdfFile && (
          <Button className="w-full gap-2" onClick={openSign}>
            <PenLine className="h-4 w-4" /> Unterschreiben
          </Button>
        )}
        <Button variant="outline" className="w-full gap-2" onClick={open}>
          <Download className="h-4 w-4" /> Öffnen
        </Button>
      </div>

      {dirty && (
        <div className="border-t p-3">
          <Button className="w-full" onClick={save} disabled={update.isPending}>
            Änderungen speichern
          </Button>
        </div>
      )}

      <SignPdfDialog
        open={!!signUrl}
        onOpenChange={(o) => !o && setSignUrl(null)}
        sourceUrl={signUrl}
        fileName={file.display_name}
        savedHint="Die unterschriebene Fassung liegt jetzt im selben Ordner wie das Original."
        onSave={async ({ blob, fileName, items }) => {
          await saveSignedBuildingFile({
            file: { ...file, building_id: null, is_company: true },
            sourceBucket: companyFileBucket(file.source, file.storage_bucket),
            fileName,
            blob,
            items,
            context: "company_file",
          });
          invalidate();
        }}
        renderDone={({ blob, fileName, close }) => (
          <Button
            onClick={() => {
              close();
              openCompose({ attachments: [new File([blob], fileName, { type: "application/pdf" })] });
            }}
          >
            <Mail className="h-4 w-4 mr-1.5" /> Per E-Mail senden
          </Button>
        )}
      />
    </div>
  );
}
