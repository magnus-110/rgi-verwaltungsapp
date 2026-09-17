import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  useBookingLearning,
  type BookingSnapshot,
  type LearnableChange,
  type LearnScope,
} from "@/hooks/useBookingLearning";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Wird nach dem Speichern (oder "Nur diesmal") aufgerufen. */
  onDone?: () => void;
  aenderungen: LearnableChange[];
  vorher: BookingSnapshot;
  nachher: BookingSnapshot;
  buildingId?: string | null;
  buildingName?: string | null;
  bookingId?: string | null;
  bankTransactionId?: string | null;
  managementMode?: string | null;
  vendorName?: string | null;
}

/**
 * Fragt nach einer Handkorrektur, ob die KI daraus lernen soll.
 *
 * Der Dialog erscheint NUR, wenn sich etwas Lernbares geaendert hat, und
 * steht bewusst auf "Nur diese eine Buchung" — niemand soll versehentlich
 * eine Regel erzeugen.
 */
export function LearnFromCorrectionDialog({
  open, onOpenChange, onDone, aenderungen, vorher, nachher,
  buildingId, buildingName, bookingId, bankTransactionId, managementMode, vendorName,
}: Props) {
  const { korrekturMerken } = useBookingLearning();
  const [scope, setScope] = useState<LearnScope>("einmalig");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setScope("einmalig"); setReason(""); }
  }, [open]);

  const schliessen = () => { onOpenChange(false); onDone?.(); };

  const handleSave = async () => {
    if (scope === "einmalig") { schliessen(); return; }
    setSaving(true);
    try {
      await korrekturMerken({
        buildingId, bookingId, bankTransactionId, managementMode, vendorName,
        vorher, nachher, scope, reason,
      });
      toast.success(
        scope === "global"
          ? "Gemerkt — gilt künftig in allen Objekten"
          : "Gemerkt — gilt künftig in diesem Objekt",
      );
      schliessen();
    } catch (e: any) {
      toast.error("Konnte nicht gespeichert werden: " + (e?.message ?? "unbekannter Fehler"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) schliessen(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Soll ich mir das merken?</DialogTitle>
          <DialogDescription>
            {vendorName
              ? <>Du hast bei <b>{vendorName}</b> etwas geändert.</>
              : <>Du hast die Buchung geändert.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 divide-y">
            {aenderungen.map((a) => (
              <div key={a.field} className="px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground mb-0.5">{a.label}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="line-through text-muted-foreground break-all">{a.before}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium break-all">{a.after}</span>
                </div>
              </div>
            ))}
          </div>

          <RadioGroup value={scope} onValueChange={(v) => setScope(v as LearnScope)} className="space-y-1.5">
            <div className="flex items-start gap-2">
              <RadioGroupItem value="einmalig" id="lern-einmalig" className="mt-0.5" />
              <Label htmlFor="lern-einmalig" className="text-sm font-normal cursor-pointer">
                Nur diese eine Buchung
                <span className="block text-xs text-muted-foreground">Einzelfall, keine Regel</span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="gebaeude" id="lern-gebaeude" className="mt-0.5" disabled={!buildingId} />
              <Label htmlFor="lern-gebaeude" className="text-sm font-normal cursor-pointer">
                Immer so &ndash; in {buildingName || "diesem Objekt"}
                {vendorName && <span className="block text-xs text-muted-foreground">bei {vendorName}</span>}
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="global" id="lern-global" className="mt-0.5" />
              <Label htmlFor="lern-global" className="text-sm font-normal cursor-pointer">
                Immer so &ndash; in allen Objekten
                {vendorName && <span className="block text-xs text-muted-foreground">bei {vendorName}</span>}
              </Label>
            </div>
          </RadioGroup>

          {scope !== "einmalig" && (
            <div>
              <Label htmlFor="lern-grund" className="text-xs">Grund (optional)</Label>
              <Input
                id="lern-grund"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z.B. rechnet quartalsweise ab"
                className="h-9"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={schliessen} disabled={saving}>
            {scope === "einmalig" ? "Schließen" : "Abbrechen"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Speichern…" : scope === "einmalig" ? "Alles klar" : "Merken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
