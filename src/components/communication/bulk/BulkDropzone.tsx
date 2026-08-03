import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2, UploadCloud } from "lucide-react";
import { useFileDrop } from "./useFileDrop";

interface Props {
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
  children?: ReactNode;
}

/** Karte mit gestrichelter Ablagefläche für Datei-Uploads (Drag & Drop + Klick). */
export const BulkDropzone = ({ title, hint, icon, busy, disabled, onFiles, children }: Props) => {
  const { isOver, dropProps } = useFileDrop(onFiles, !!disabled);

  return (
    <div className="space-y-2">
      <label
        {...dropProps}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          isOver ? "border-primary bg-primary/10" : "border-border/70 bg-muted/30 hover:bg-muted/50",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <span className="text-muted-foreground">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : icon || <UploadCloud className="h-5 w-5" />}
        </span>
        <span className="text-sm font-medium">{isOver ? "Dateien hier ablegen" : title}</span>
        {hint && <span className="max-w-md text-xs text-muted-foreground">{hint}</span>}
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </label>
      {children}
    </div>
  );
};
