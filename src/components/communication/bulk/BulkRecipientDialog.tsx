import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmailPreviewPane } from "../EmailPreviewPane";
import type { PlaceholderSamples } from "../usePlaceholderSamples";
import type { RecipientGroup } from "./BulkRecipientCard";
import { Paperclip } from "lucide-react";

const fileLabel = (path: string) => (path.split("/").pop() || path).replace(/^\d+_/, "");

interface Props {
  open: boolean;
  mode: "preview" | "edit";
  group: RecipientGroup | null;
  baseSubject: string;
  baseBody: string;
  override?: { subject: string | null; body: string | null };
  samples: PlaceholderSamples;
  attachments: string[];
  signature?: string | null;
  onOpenChange: (v: boolean) => void;
  onSaveOverride: (key: string, subject: string | null, body: string | null) => void;
}

export const BulkRecipientDialog = ({
  open,
  mode,
  group,
  baseSubject,
  baseBody,
  override,
  samples,
  attachments,
  signature,
  onOpenChange,
  onSaveOverride,
}: Props) => {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    setSubject(override?.subject ?? baseSubject);
    setBody(override?.body ?? baseBody);
  }, [open, override?.subject, override?.body, baseSubject, baseBody]);

  if (!group) return null;

  const effSubject = override?.subject ?? baseSubject;
  const sig = (signature || "").trim();
  const rawBody = override?.body ?? baseBody;
  const effBody = sig && !rawBody.includes(sig) ? `${rawBody}\n\n${sig}` : rawBody;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "preview" ? "Vorschau" : "Individuell bearbeiten"} — {group.name}
          </DialogTitle>
          <DialogDescription>
            {group.email}
            {group.units.length > 0 ? ` · Einheit ${group.units.join(", ")}` : ""}
          </DialogDescription>
        </DialogHeader>

        {mode === "preview" ? (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 pr-3">
              <EmailPreviewPane subject={effSubject} body={effBody} format="plain" samples={samples} />
              <div className="space-y-1">
                <Label className="text-xs">Anhänge ({attachments.length})</Label>
                <div className="flex flex-wrap gap-1.5">
                  {attachments.length === 0 && (
                    <span className="text-xs text-muted-foreground">Keine Anhänge</span>
                  )}
                  {attachments.map((p) => (
                    <Badge key={p} variant="secondary" className="gap-1">
                      <Paperclip className="h-3 w-3" />
                      {fileLabel(p)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Betreff</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Text</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} />
            </div>
            <p className="text-xs text-muted-foreground">
              Diese Fassung gilt nur für diesen Empfänger. Platzhalter funktionieren wie im Standardtext.
            </p>
          </div>
        )}

        <DialogFooter>
          {mode === "edit" && (
            <Button
              variant="outline"
              onClick={() => {
                onSaveOverride(group.key, null, null);
                onOpenChange(false);
              }}
            >
              Auf Standardtext zurücksetzen
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          {mode === "edit" && (
            <Button
              onClick={() => {
                onSaveOverride(
                  group.key,
                  subject === baseSubject ? null : subject,
                  body === baseBody ? null : body,
                );
                onOpenChange(false);
              }}
            >
              Übernehmen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
