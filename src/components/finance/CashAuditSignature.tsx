import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, RotateCcw, PenLine } from "lucide-react";

interface CashAuditSignatureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: Record<string, any>;
  notes: string;
  onComplete: (signatureData: string, notes: string) => void;
  saving?: boolean;
}

export function CashAuditSignature({ open, onOpenChange, progress, notes: initialNotes, onComplete, saving }: CashAuditSignatureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [finalNotes, setFinalNotes] = useState(initialNotes || "");

  useEffect(() => {
    setFinalNotes(initialNotes || "");
  }, [initialNotes, open]);

  useEffect(() => {
    if (open && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
      setHasSignature(false);
    }
  }, [open]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignature(false);
  };

  const handleSubmit = () => {
    if (!canvasRef.current || !hasSignature) return;
    const data = canvasRef.current.toDataURL("image/png");
    onComplete(data, finalNotes);
  };

  const checkedAccounts = Object.values(progress?.checkedAccounts || {}).filter(Boolean).length;
  const totalAccounts = Object.keys(progress?.checkedAccounts || {}).length;
  const flaggedOk = Object.values(progress?.bookingFlags || {}).filter((v) => v === "ok").length;
  const flaggedIssue = Object.values(progress?.bookingFlags || {}).filter((v) => v === "issue").length;
  const noteCount = Object.values(progress?.accountNotes || {}).filter((v) => v && (v as string).trim()).length +
    Object.values(progress?.bookingNotes || {}).filter((v) => v && (v as string).trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            Kassenprüfung abschließen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
            <div className="font-medium mb-2">Zusammenfassung</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Konten geprüft</span>
              <span>{checkedAccounts} von {totalAccounts || "–"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buchungen geprüft</span>
              <span className="text-green-600">{flaggedOk} ✓</span>
            </div>
            {flaggedIssue > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Auffälligkeiten</span>
                <span className="text-amber-600">{flaggedIssue} ⚠</span>
              </div>
            )}
            {noteCount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Anmerkungen</span>
                <span>{noteCount}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label>Gesamtanmerkung (optional)</Label>
            <Textarea
              value={finalNotes}
              onChange={(e) => setFinalNotes(e.target.value)}
              placeholder="Allgemeine Anmerkungen zur Kassenprüfung..."
              rows={3}
            />
          </div>

          {/* Signature pad */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Unterschrift</Label>
              <Button variant="ghost" size="sm" onClick={clearCanvas} className="gap-1 text-xs h-7">
                <RotateCcw className="h-3 w-3" /> Löschen
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                width={460}
                height={160}
                className="w-full cursor-crosshair touch-none"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            {!hasSignature && (
              <p className="text-xs text-muted-foreground mt-1">Bitte unterschreiben Sie im Feld oben.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={!hasSignature || saving} className="gap-1.5">
            <Check className="h-4 w-4" />
            {saving ? "Wird gespeichert..." : "Bestätigen & Unterschreiben"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
