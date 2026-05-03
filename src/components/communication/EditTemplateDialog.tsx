import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Save, Code, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: any | null;
}

/** Extract {{var}} placeholders from subject + body (sorted unique). */
function extractVariables(subject: string, body: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  for (const src of [subject, body]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) set.add(m[1]);
  }
  return Array.from(set).sort();
}

export const EditTemplateDialog = ({ open, onOpenChange, template }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [bodyFormat, setBodyFormat] = useState<"html" | "plain">("plain");
  const [isGlobal, setIsGlobal] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!template) return;
    setName(template.name || "");
    setDescription(template.description || "");
    setSubject(template.subject || "");
    setBody(template.body_html || "");
    setBodyFormat((template.body_format as "html" | "plain") || "plain");
    setIsGlobal(!!template.is_global);
  }, [template]);

  if (!template) return null;
  const isLetter = template.type === "letter";

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name erforderlich", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const updates: any = {
        name: name.trim(),
        description: description.trim() || null,
        is_global: isGlobal,
      };
      if (!isLetter) {
        updates.subject = subject;
        updates.body_html = body;
        updates.body_format = bodyFormat;
        updates.variables = extractVariables(subject, body);
      } else {
        // For letters we only allow editing meta data (name, description, scope)
        // since body lives in the docx_path. Description still useful.
      }
      const { error } = await supabase
        .from("comm_templates")
        .update(updates)
        .eq("id", template.id);
      if (error) throw error;
      toast({ title: "Vorlage gespeichert" });
      qc.invalidateQueries({ queryKey: ["comm-templates"] });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message || "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Vorlage bearbeiten</DialogTitle>
          <DialogDescription>
            {isLetter
              ? "Brief-Vorlagen: Name, Beschreibung und Sichtbarkeit anpassen. Den Brieftext selbst bearbeitest du in der DOCX-Datei."
              : "Passe Name, Betreff, Inhalt und Sichtbarkeit der E-Mail-Vorlage an. Platzhalter wie {{vorname}} werden beim Versand ersetzt."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label>Beschreibung</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kurze Beschreibung (optional)" />
          </div>

          {!isLetter && (
            <>
              <div>
                <Label className="mb-1.5 block">Format</Label>
                <RadioGroup
                  value={bodyFormat}
                  onValueChange={(v) => setBodyFormat(v as "html" | "plain")}
                  className="flex gap-2"
                >
                  <label className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${bodyFormat === "plain" ? "border-primary bg-primary/5" : "border-input hover:bg-accent"}`}>
                    <RadioGroupItem value="plain" />
                    <Type className="h-4 w-4" /> Klartext
                  </label>
                  <label className={`flex-1 flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${bodyFormat === "html" ? "border-primary bg-primary/5" : "border-input hover:bg-accent"}`}>
                    <RadioGroupItem value="html" />
                    <Code className="h-4 w-4" /> HTML
                  </label>
                </RadioGroup>
              </div>

              <div>
                <Label>Betreff</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              <div>
                <Label>Inhalt</Label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={14}
                  className={bodyFormat === "html" ? "font-mono text-xs" : ""}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Verfügbare Platzhalter z. B. {"{{vorname}}"}, {"{{nachname}}"}, {"{{anrede_brief}}"}, {"{{einheit}}"}, {"{{gebaeude_name}}"}.
                </p>
              </div>
            </>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Global verfügbar</Label>
              <p className="text-xs text-muted-foreground">Wenn aktiv: in allen Liegenschaften sichtbar.</p>
            </div>
            <Switch checked={isGlobal} onCheckedChange={setIsGlobal} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
