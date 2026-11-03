import { useEffect, useState } from "react";
import { Check, Loader2, Mail, Stamp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bezahltDateiname, bezahltStempelAusSpeicher, heuteIso } from "@/lib/bezahltStempel";

interface BezahltStempelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wo das Original liegt (wird nur gelesen, nie verändert). */
  quelle: { bucket: string; path: string; name: string } | null;
  /** Gestempelte Kopie an derselben Stelle wie das Original speichern. */
  onSave: (p: { blob: Blob; fileName: string; isoDatum: string }) => Promise<void>;
  /** Kopie per E-Mail weiterleiten (Datei als Anhang). */
  onPerMail: (file: File) => void;
  /** Hinweis nach dem Speichern, wo die Kopie liegt. */
  ortHinweis: string;
}

/**
 * Bezahlt-Stempel: nur ein Datumsfeld, Stempel oben rechts auf Seite 1.
 * Danach „Per Mail weiterleiten“ oder „Fertig“.
 */
export function BezahltStempelDialog({ open, onOpenChange, quelle, onSave, onPerMail, ortHinweis }: BezahltStempelDialogProps) {
  const [datum, setDatum] = useState(heuteIso());
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setDatum(heuteIso());
      setFertig(null);
      setLaeuft(false);
    }
  }, [open]);

  const stempeln = async () => {
    if (!quelle || !datum) return;
    setLaeuft(true);
    try {
      const blob = await bezahltStempelAusSpeicher(quelle.bucket, quelle.path, datum);
      const fileName = bezahltDateiname(quelle.name);
      await onSave({ blob, fileName, isoDatum: datum });
      setFertig(new File([blob], fileName, { type: "application/pdf" }));
    } catch (e) {
      toast.error("Stempeln fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !laeuft && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stamp className="h-4 w-4" /> Bezahlt-Stempel
          </DialogTitle>
          <DialogDescription className="break-all">{quelle?.name}</DialogDescription>
        </DialogHeader>

        {fertig ? (
          <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-medium">{fertig.name}</span> wurde erstellt. {ortHinweis} Das Original bleibt unverändert.
            </span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="bezahlt-datum">Bezahlt am</Label>
            <Input id="bezahlt-datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} disabled={laeuft} />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {fertig ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fertig
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onPerMail(fertig);
                }}
              >
                <Mail className="mr-1.5 h-4 w-4" /> Per Mail weiterleiten
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={laeuft}>
                Abbrechen
              </Button>
              <Button onClick={stempeln} disabled={laeuft || !datum || !quelle}>
                {laeuft ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Stamp className="mr-1.5 h-4 w-4" />}
                Stempeln
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
