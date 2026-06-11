import { useRef, useState } from "react";
import { Phone, StickyNote, Save, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAddCaseEvent } from "@/hooks/useCases";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface PendingFile {
  file: File;
  uploading: boolean;
  path?: string;
  error?: string;
}

interface Props {
  caseId: string;
  buildingId: string;
  /** When set, the new event will be a child of this event (one level only). */
  parentEventId?: string | null;
  /** Called after a successful submit. */
  onDone?: () => void;
}

export const CaseQuickAdd = ({ caseId, buildingId, parentEventId, onDone }: Props) => {
  const [text, setText] = useState("");
  const [type, setType] = useState<"note" | "phone">("note");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const addEvent = useAddCaseEvent();

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const newFiles: PendingFile[] = Array.from(fileList).map((file) => ({ file, uploading: true }));
    setFiles((prev) => [...prev, ...newFiles]);

    for (let i = 0; i < newFiles.length; i++) {
      const pf = newFiles[i];
      try {
        const ext = pf.file.name.split(".").pop() || "bin";
        const path = `cases/${buildingId}/${caseId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("building-files").upload(path, pf.file, {
          contentType: pf.file.type || "application/octet-stream",
        });
        if (error) throw error;
        setFiles((prev) => prev.map((f) => (f.file === pf.file ? { ...f, uploading: false, path } : f)));
      } catch (e: any) {
        setFiles((prev) => prev.map((f) => (f.file === pf.file ? { ...f, uploading: false, error: e.message } : f)));
        toast({ title: "Upload-Fehler", description: e.message, variant: "destructive" });
      }
    }
  };

  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f.file !== file));
  };

  const submit = async () => {
    if (!text.trim() && files.length === 0) return;
    const ready = files.filter((f) => !f.uploading && !f.error && f.path);
    if (files.some((f) => f.uploading)) {
      toast({ title: "Bitte warten", description: "Uploads laufen noch." });
      return;
    }
    const attachments = ready.map((f) => ({
      name: f.file.name,
      path: f.path,
      mime: f.file.type,
      size: f.file.size,
    }));
    await addEvent.mutateAsync({
      case_id: caseId,
      event_type: type,
      title: type === "phone" ? "Telefonat" : undefined,
      body: text.trim() || undefined,
      attachments,
      parent_event_id: parentEventId || null,
    });
    setText("");
    setType("note");
    setFiles([]);
    onDone?.();
  };

  return (
    <div className="space-y-2 p-3 border rounded-lg bg-card">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={type === "note" ? "default" : "ghost"} onClick={() => setType("note")}>
          <StickyNote className="h-4 w-4 mr-1" /> Notiz
        </Button>
        <Button size="sm" variant={type === "phone" ? "default" : "ghost"} onClick={() => setType("phone")}>
          <Phone className="h-4 w-4 mr-1" /> Telefonat
        </Button>
      </div>
      <Textarea
        placeholder={type === "phone" ? "Was wurde besprochen?" : "Notiz zum Vorgang..."}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <div key={f.file.name + f.file.size} className="text-xs bg-muted px-2 py-1 rounded inline-flex items-center gap-1.5">
              {f.uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
              <span className="max-w-[160px] truncate">{f.file.name}</span>
              {f.error && <span className="text-destructive">!</span>}
              <button onClick={() => removeFile(f.file)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()} type="button">
            <Paperclip className="h-4 w-4 mr-1" /> Anhang
          </Button>
          <span className="text-xs text-muted-foreground hidden sm:inline">⌘/Strg + Enter</span>
        </div>
        <Button size="sm" onClick={submit} disabled={(!text.trim() && files.length === 0) || addEvent.isPending}>
          {addEvent.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};
