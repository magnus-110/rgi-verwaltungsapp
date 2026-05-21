import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Upload, FileText, Mail, Code, Type, X, FileCheck2, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { FriendlyVariablePalette } from "./FriendlyVariablePalette";
import { usePlaceholderStats } from "./usePlaceholderStats";
import { usePlaceholderSamples } from "./usePlaceholderSamples";
import { WysiwygPlaceholderEditor, type WysiwygPlaceholderEditorHandle } from "./WysiwygPlaceholderEditor";


interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
  defaultType?: "letter" | "email";
  templateKind?: "general" | "etv_invitation";
  title?: string;
}

export const TemplateUploadDialog = ({ open, onOpenChange, buildingId, defaultType = "letter", templateKind = "general", title }: Props) => {

  const [type, setType] = useState<"letter" | "email">(defaultType);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyFormat, setBodyFormat] = useState<"html" | "plain">("plain");
  const [isGlobal, setIsGlobal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const bodyRef = useRef<WysiwygPlaceholderEditorHandle>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: placeholderStats } = usePlaceholderStats(buildingId, []);
  const { data: placeholderSamples } = usePlaceholderSamples(buildingId, []);

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
    setBodyFormat("plain");
    setIsGlobal(false);
  };

  const insertPlaceholder = (ph: string) => {
    bodyRef.current?.insert(ph);
  };

  const handleDrop = (_e: React.DragEvent) => {
    // Drag handling lives inside the WysiwygPlaceholderEditor itself.
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
        const sanitizeFileName = (n: string): string => {
          const dot = n.lastIndexOf(".");
          const base = dot > 0 ? n.slice(0, dot) : n;
          const ext = dot > 0 ? n.slice(dot) : "";
          const cleaned = base
            .replace(/ü/g, "ue").replace(/Ü/g, "Ue")
            .replace(/ö/g, "oe").replace(/Ö/g, "Oe")
            .replace(/ä/g, "ae").replace(/Ä/g, "Ae")
            .replace(/ß/g, "ss")
            .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]+/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "");
          return (cleaned || "datei") + ext.toLowerCase();
        };
        const safeName = sanitizeFileName(file.name);
        const folder = isGlobal ? "global" : buildingId;
        const path = `templates/${folder}/${Date.now()}_${safeName}`;
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
        building_id: isGlobal ? null : buildingId,
        is_global: isGlobal,
        docx_path: docxPath,
        subject: type === "email" ? subject.trim() || null : null,
        body_html: type === "email" ? bodyHtml : null,
        body_format: type === "email" ? bodyFormat : "html",
        variables,
        template_kind: templateKind,
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
          <DialogTitle>{title || "Neue Vorlage"}</DialogTitle>
          <DialogDescription>Erstellen Sie eine wiederverwendbare {templateKind === "etv_invitation" ? "ETV-Einladungsvorlage" : "Brief- oder E-Mail-Vorlage"} mit Platzhaltern.</DialogDescription>
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

            <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/30 p-3">
              <div className="flex items-start gap-2 min-w-0">
                <Globe className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <Label htmlFor="tmpl-global" className="cursor-pointer">Gebäudeübergreifend verfügbar</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Wenn aktiviert, ist diese Vorlage in allen Liegenschaften nutzbar (nicht nur in dieser).
                  </p>
                </div>
              </div>
              <Switch id="tmpl-global" checked={isGlobal} onCheckedChange={setIsGlobal} />
            </div>

            <TabsContent value="letter" className="mt-0 space-y-3">
              <Label>Word-Datei (.docx) *</Label>
              {file ? (
                <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 flex items-center gap-4">
                  <div className="flex-shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-md bg-primary/10">
                    <FileCheck2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate" title={file.name}>
                      {file.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{formatBytes(file.size)}</span>
                      <span>·</span>
                      <span className="text-primary font-medium">Bereit zum Hochladen</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex gap-1">
                    <input
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => acceptDocxFile(e.target.files?.[0])}
                      className="hidden"
                      id="docx-upload-replace"
                    />
                    <label htmlFor="docx-upload-replace">
                      <Button variant="outline" size="sm" asChild>
                        <span className="cursor-pointer">Ersetzen</span>
                      </Button>
                    </label>
                    <Button variant="ghost" size="sm" onClick={() => setFile(null)} title="Entfernen">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging ? "border-primary bg-primary/10" : "border-input hover:border-primary/40 hover:bg-accent/30"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setIsDragging(true); }}
                  onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) acceptDocxFile(f);
                  }}
                >
                  <Upload className={`h-10 w-10 mx-auto mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  <input
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => acceptDocxFile(e.target.files?.[0])}
                    className="hidden"
                    id="docx-upload"
                  />
                  <label htmlFor="docx-upload" className="cursor-pointer">
                    <div className="text-sm font-medium">
                      <span className="text-primary hover:underline">Datei auswählen</span>
                      <span className="text-muted-foreground"> oder hierher ziehen</span>
                    </div>
                  </label>
                  <p className="text-xs text-muted-foreground mt-2">
                    Nur .docx · Platzhalter wie <code className="px-1 py-0.5 rounded bg-muted">{"{{vorname}}"}</code> direkt in Word einfügen
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="email" className="mt-0 space-y-3">
              <div>
                <Label>Format</Label>
                <RadioGroup
                  value={bodyFormat}
                  onValueChange={(v) => setBodyFormat(v as "html" | "plain")}
                  className="flex gap-2 mt-1"
                >
                  <label className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${bodyFormat === "plain" ? "border-primary bg-primary/5" : "border-input hover:bg-accent"}`}>
                    <RadioGroupItem value="plain" />
                    <Type className="h-4 w-4" /> Klartext
                    <span className="text-xs text-muted-foreground ml-auto">Empfohlen</span>
                  </label>
                  <label className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${bodyFormat === "html" ? "border-primary bg-primary/5" : "border-input hover:bg-accent"}`}>
                    <RadioGroupItem value="html" />
                    <Code className="h-4 w-4" /> HTML
                    <span className="text-xs text-muted-foreground ml-auto">Formatiert</span>
                  </label>
                </RadioGroup>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-3">
                <div className="space-y-3 min-w-0">
                  <div>
                    <Label>Betreff *</Label>
                    <WysiwygPlaceholderEditor
                      value={subject}
                      onChange={setSubject}
                      samples={placeholderSamples}
                      singleLine
                      ariaLabel="Betreff"
                      placeholder="z. B. Wichtige Information zur Hausversammlung"
                    />
                  </div>
                  <div>
                    <Label>Inhalt {bodyFormat === "html" ? "(HTML erlaubt)" : "(Klartext)"} *</Label>
                    <WysiwygPlaceholderEditor
                      ref={bodyRef}
                      value={bodyHtml}
                      onChange={setBodyHtml}
                      samples={placeholderSamples}
                      monospace={bodyFormat === "html"}
                      minHeight={320}
                      ariaLabel="Inhalt"
                      placeholder={"{{anrede_brief}}\n\nhiermit informieren wir Sie...\n\nMit freundlichen Grüßen\n{{verwalter_name}}"}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Platzhalter werden direkt mit echten Beispielwerten (grau) angezeigt.
                    </p>
                  </div>
                </div>
                <aside className="border rounded-md bg-muted/30 p-2 self-start">
                  <h4 className="text-xs font-semibold mb-1 px-1">Platzhalter einfügen</h4>
                  <FriendlyVariablePalette
                    onInsert={insertPlaceholder}
                    stats={placeholderStats}
                    samples={placeholderSamples}
                  />
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
