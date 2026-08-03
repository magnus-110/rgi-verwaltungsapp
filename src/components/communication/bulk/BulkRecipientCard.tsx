import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Eye, Paperclip, Pencil, Plus, X } from "lucide-react";

export type RecipientGroup = {
  /** Schlüssel, unter dem gesendet wird (`assignmentId|email`) */
  key: string;
  /** alle Schlüssel derselben E-Mail-Adresse (bei Zusammenfassung > 1) */
  keys: string[];
  name: string;
  email: string;
  role: string | null;
  units: string[];
};

const fileLabel = (path: string) => (path.split("/").pop() || path).replace(/^\d+_/, "");

interface Props {
  group: RecipientGroup;
  selected: boolean;
  paths: string[];
  hasOverride: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemovePath: (path: string) => void;
  onAddFiles: (files: FileList | null) => void;
  onPreview: () => void;
  onEdit: () => void;
}

export const BulkRecipientCard = ({
  group,
  selected,
  paths,
  hasOverride,
  busy,
  onToggle,
  onRemovePath,
  onAddFiles,
  onPreview,
  onEdit,
}: Props) => {
  return (
    <Card
      className={cn(
        "p-3 transition-colors",
        selected ? "border-primary/40 bg-primary/[0.03]" : "opacity-90 hover:bg-muted/30",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5" />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggle}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{group.name}</span>
            {group.units.map((u) => (
              <Badge key={u} variant="outline" className="text-[10px]">
                {u}
              </Badge>
            ))}
            {group.keys.length > 1 && (
              <Badge variant="secondary" className="text-[10px]">
                zusammengefasst
              </Badge>
            )}
            {hasOverride && (
              <Badge variant="secondary" className="text-[10px]">
                individuell
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{group.email}</div>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPreview} aria-label="Vorschau">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} aria-label="Individuell bearbeiten">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-2 pl-7 flex flex-wrap items-center gap-1.5">
        {paths.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">Kein persönlicher Anhang</span>
        ) : (
          paths.map((p) => (
            <Badge key={p} variant="secondary" className="gap-1 max-w-[220px]">
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{fileLabel(p)}</span>
              <button type="button" onClick={() => onRemovePath(p)} aria-label="Anhang entfernen">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" asChild disabled={busy}>
          <label className="cursor-pointer">
            <Plus className="h-3 w-3 mr-0.5" /> Datei
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                onAddFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </Button>
      </div>
    </Card>
  );
};
