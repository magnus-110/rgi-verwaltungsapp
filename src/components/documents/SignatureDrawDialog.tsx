import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/buildings/keys/SignaturePad";
import { trimSignatureDataUrl } from "@/lib/pdfSign";
import { useSaveMySignature } from "@/lib/documentSigning";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Liefert die zugeschnittene Unterschrift (PNG als data:-Adresse). */
  onDone: (sig: { dataUrl: string; width: number; height: number }) => void;
  /** Häkchen „als meine Unterschrift hinterlegen“ anzeigen (Standard: ja). */
  offerSave?: boolean;
  title?: string;
}

/** Fenster zum Zeichnen einer Unterschrift mit Finger, Stift oder Maus. */
export function SignatureDrawDialog({ open, onOpenChange, onDone, offerSave = true, title = "Unterschrift zeichnen" }: Props) {
  const [value, setValue] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const saveMine = useSaveMySignature();

  useEffect(() => {
    if (open) {
      setValue(null);
      setPadKey((k) => k + 1);
    }
  }, [open]);

  const confirm = async () => {
    if (!value) {
      toast.error("Bitte zuerst im Feld unterschreiben");
      return;
    }
    setBusy(true);
    try {
      const trimmed = await trimSignatureDataUrl(value);
      if (offerSave && remember) {
        try {
          await saveMine(trimmed.dataUrl);
        } catch (e: any) {
          toast.error("Unterschrift konnte nicht hinterlegt werden: " + (e?.message || e));
        }
      }
      onDone(trimmed);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Unterschrift konnte nicht übernommen werden");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Mit Finger, Stift oder Maus im weißen Feld unterschreiben.</DialogDescription>
        </DialogHeader>
        {/* key: bei jedem Öffnen ein frisches Zeichenfeld */}
        <SignaturePad key={padKey} value={null} onChange={setValue} height={220} />
        {offerSave && (
          <div className="flex items-center gap-2">
            <Checkbox id="remember-signature" checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
            <Label htmlFor="remember-signature" className="text-sm font-normal">
              Als meine Unterschrift hinterlegen (nächstes Mal mit einem Tipp einsetzen)
            </Label>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button onClick={confirm} disabled={busy || !value}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Übernehmen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
