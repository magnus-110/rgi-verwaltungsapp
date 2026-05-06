import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  EmailTemplate,
  useDeleteEmailTemplate,
  useSaveEmailTemplate,
} from "@/hooks/useEmailTemplates";
import { AVAILABLE_PLACEHOLDERS } from "@/lib/emailTemplateVars";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: EmailTemplate | null;
  onSaved?: () => void;
}

export function EmailTemplateEditorDialog({ open, onOpenChange, template, onSaved }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isShared, setIsShared] = useState(true);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const save = useSaveEmailTemplate();
  const del = useDeleteEmailTemplate();

  useEffect(() => {
    if (open) {
      setName(template?.name || "");
      setCategory(template?.category || "");
      setSubject(template?.subject || "");
      setBody(template?.body || "");
      setIsShared(template?.is_shared ?? true);
    }
  }, [open, template]);

  const insertPlaceholder = (ph: string) => {
    const el = bodyRef.current;
    if (!el) return setBody((b) => b + ph);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + ph + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ph.length, start + ph.length);
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    try {
      await save.mutateAsync({
        id: template?.id,
        name: name.trim(),
        category: category.trim() || null,
        subject,
        body,
        is_shared: isShared,
      });
      toast.success(template ? "Vorlage aktualisiert" : "Vorlage angelegt");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Speichern fehlgeschlagen");
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    if (!confirm(`Vorlage "${template.name}" löschen?`)) return;
    try {
      await del.mutateAsync(template.id);
      toast.success("Vorlage gelöscht");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Löschen fehlgeschlagen");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl z-[100]">
        <DialogHeader>
          <DialogTitle>{template ? "Vorlage bearbeiten" : "Neue Vorlage"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Mahnung Hausgeld" />
            </div>
            <div>
              <Label>Kategorie</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="z.B. Mahnungen" />
            </div>
          </div>

          <div>
            <Label>Betreff</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Optional" />
          </div>

          <div>
            <Label>Text</Label>
            <Textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground mb-2">Platzhalter (Klick zum Einfügen):</p>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_PLACEHOLDERS.map((ph) => (
                <Badge
                  key={ph}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent font-mono text-xs"
                  onClick={() => insertPlaceholder(ph)}
                >
                  {ph}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={isShared} onCheckedChange={setIsShared} id="shared" />
              <Label htmlFor="shared" className="cursor-pointer">
                Für alle Nutzer sichtbar
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {template && (
              <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Löschen
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
