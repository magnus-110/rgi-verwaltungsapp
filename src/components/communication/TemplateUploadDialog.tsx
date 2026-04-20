import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, FileText, Mail, Code, Type, X, FileCheck2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { VariablePalette } from "./VariablePalette";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
  defaultType?: "letter" | "email";
}

export const TemplateUploadDialog = ({ open, onOpenChange, buildingId, defaultType = "letter" }: Props) => {
  const [type, setType] = useState<"letter" | "email">(defaultType);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyFormat, setBodyFormat] = useState<"html" | "plain">("html");
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const formatBytes = (b: number): string => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  };

  const acceptDocxFile = (f: File | null | undefined) => {
    if (!f) return;
    const isDocx =
      f.name.toLowerCase().endsWith(".docx") ||
      f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!isDocx) {
      toast({ title: "Nur Word-Dateien (.docx) erlaubt", variant: "destructive" });
      return;
    }
    setFile(f);
  };

  const reset = () => {
    setName(""); setDescription(""); setFile(null);
    setSubject(""); setBodyHtml(""); setType(defaultType);
    setBodyFormat("html");
  };

  const insertPlaceholder = (ph: string) => {
    const ta = bodyRef.current;
    if (!ta) { setBodyHtml(bodyHtml + ph); return; }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const next = ta.value.slice(0, start) + ph + ta.value.slice(end);
    setBodyHtml(next);
    requestAnimationFrame(() => {
      ta.focus();
      const p = start + ph.length;
      ta.setSelectionRange(p, p);
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const ph = e.dataTransfer.getData("text/plain");
    if (ph) insertPlaceholder(ph);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Name fehlt", variant: "destructive" }); return; }
    if (type === "letter" && !file) { toast({ title: "Word-Datei fehlt", variant: "destructive" }); return; }
    if (type === "email" && !bodyHtml.trim()) { toast({ title: "Inhalt fehlt", variant: "destructive" }); return; }

    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");

      let docxPath: string | null = null;
      let variables: string[] = [];

      if (type === "letter" && file) {
        const path = `templates/${buildingId}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("comm-assets").upload(path, file, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        if (upErr) throw upErr;
        docxPath = path;

        // parse placeholders
        const { data: parsed, error: parseErr } = await supabase.functions.invoke("comm-parse-template", {
          body: { docx_path: path },
        });
        if (parseErr) throw parseErr;
        variables = (parsed as any)?.variables || [];
      }

      const { error: insErr } = await supabase.from("comm_templates").insert({
        name: name.trim(),
        description: description.trim() || null,
        type,
        building_id: buildingId,
        docx_path: docxPath,
        subject: type === "email" ? subject.trim() || null : null,
        body_html: type === "email" ? bodyHtml : null,
        body_format: type === "email" ? bodyFormat : "html",
        variables,
        created_by: userId,
      });
      if (insErr) throw insErr;

      toast({ title: "Vorlage gespeichert", description: variables.length > 0 ? `${variables.length} Platzhalter erkannt` : undefined });
      qc.invalidateQueries({ queryKey: ["comm-templates", buildingId] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neue Vorlage</DialogTitle>
          <DialogDescription>Erstellen Sie eine wiederverwendbare Brief- oder E-Mail-Vorlage mit Platzhaltern.</DialogDescription>
        </DialogHeader>

        <Tabs value={type} onValueChange={(v) => setType(v as any)}>
          <TabsList>
            <TabsTrigger value="letter"><FileText className="h-4 w-4 mr-1" /> Serienbrief</TabsTrigger>
            <TabsTrigger value="email"><Mail className="h-4 w-4 mr-1" /> Rundmail</TabsTrigger>
          </TabsList>

          <div className="space-y-4 mt-4">
            <div>
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Einladung Eigentümerversammlung" />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>

            <TabsContent value="letter" className="mt-0 space-y-3">
              <Label>Word-Datei (.docx) *</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="docx-upload"
                />
                <label htmlFor="docx-upload" className="cursor-pointer text-sm text-primary hover:underline">
                  {file ? file.name : "Datei auswählen"}
                </label>
                <p className="text-xs text-muted-foreground mt-2">
                  Platzhalter wie <code>{"{{vorname}}"}</code> direkt in Word einfügen
                </p>
              </div>
            </TabsContent>

            <TabsContent value="email" className="mt-0 space-y-3">
              <div>
                <Label>Format</Label>
                <RadioGroup
                  value={bodyFormat}
                  onValueChange={(v) => setBodyFormat(v as "html" | "plain")}
                  className="flex gap-2 mt-1"
                >
                  <label className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${bodyFormat === "html" ? "border-primary bg-primary/5" : "border-input hover:bg-accent"}`}>
                    <RadioGroupItem value="html" />
                    <Code className="h-4 w-4" /> HTML
                  </label>
                  <label className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${bodyFormat === "plain" ? "border-primary bg-primary/5" : "border-input hover:bg-accent"}`}>
                    <RadioGroupItem value="plain" />
                    <Type className="h-4 w-4" /> Klartext
                  </label>
                </RadioGroup>
              </div>
              <div>
                <Label>Betreff *</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="z. B. Wichtige Information zur Hausversammlung" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
                <div className="min-w-0">
                  <Label>Inhalt {bodyFormat === "html" ? "(HTML erlaubt)" : "(Klartext)"} *</Label>
                  <Textarea
                    ref={bodyRef}
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                    onDrop={handleDrop}
                    rows={14}
                    placeholder={"{{anrede_brief}}\n\nhiermit informieren wir Sie...\n\nMit freundlichen Grüßen\n{{verwalter_name}}"}
                    className={bodyFormat === "html" ? "font-mono text-sm" : "text-sm"}
                  />
                </div>
                <aside className="border rounded-md bg-muted/30 p-2 self-start">
                  <h4 className="text-xs font-semibold mb-1 px-1">Platzhalter</h4>
                  <VariablePalette onInsert={insertPlaceholder} />
                </aside>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? "Speichere..." : "Speichern"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
