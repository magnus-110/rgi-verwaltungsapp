import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Upload, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId?: string | null;
}

export function Paragraph35aTemplatesDialog({ open, onOpenChange, buildingId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["35a-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paragraph_35a_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const upload = async () => {
    if (!file || !name.trim()) {
      toast({ title: "Name und Datei erforderlich", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const safeName = file.name
        .normalize("NFKD")
        .replace(/[^\w.\-]+/g, "_")
        .replace(/_+/g, "_");
      const path = `${crypto.randomUUID()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("paragraph-35a-templates")
        .upload(path, file, {
          contentType:
            file.type ||
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: false,
        });
      if (upErr) {
        console.error("[35a-template upload] storage error", upErr);
        throw upErr;
      }
      const { error: insErr } = await supabase.from("paragraph_35a_templates").insert({
        name: name.trim(),
        storage_path: path,
        original_filename: file.name,
        building_id: buildingId || null,
      });
      if (insErr) throw insErr;
      setName(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["35a-templates"] });
      toast({ title: "Vorlage gespeichert" });
    } catch (e) {
      toast({ title: "Upload fehlgeschlagen", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: any) => {
    if (!confirm(`Vorlage "${t.name}" löschen?`)) return;
    await supabase.storage.from("paragraph-35a-templates").remove([t.storage_path]);
    await supabase.from("paragraph_35a_templates").delete().eq("id", t.id);
    qc.invalidateQueries({ queryKey: ["35a-templates"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>§35a Word-Vorlagen</DialogTitle>
          <DialogDescription>
            Lade eine .docx-Vorlage mit Platzhaltern wie <code>{"{{empfaenger_name}}"}</code> und Tabellen-Loops <code>{"{{#positionen}}…{{/positionen}}"}</code> hoch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border rounded-md p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Standard 2025" />
            </div>
            <div>
              <Label className="text-xs">Datei (.docx)</Label>
              <Input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <Button onClick={upload} disabled={busy} size="sm">
            <Upload className="h-4 w-4 mr-2" /> Hochladen
          </Button>
        </div>

        <div className="space-y-1 max-h-[400px] overflow-auto">
          {templates.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Noch keine Vorlagen.</div>
          ) : templates.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between border rounded p-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.original_filename}</div>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(t)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
