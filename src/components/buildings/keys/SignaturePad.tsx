import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

export const SignaturePad = ({ value, onChange, height = 160 }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(!!value);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(!!value);

  const setupCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0) return;
    c.width = rect.width * ratio;
    c.height = height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, height);
      img.src = value;
    }
  };

  useEffect(() => {
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const c = canvasRef.current!;
    try { c.setPointerCapture(e.pointerId); } catch {}
    drawingRef.current = true;
    const ctx = c.getContext("2d")!;
    const { x, y } = pos(e);
    lastRef.current = { x, y };
    // Dot on tap
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.fill();
    hasInkRef.current = true;
    if (!hasInk) setHasInk(true);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    const last = lastRef.current ?? { x, y };
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastRef.current = { x, y };
  };
  const end = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    try { canvasRef.current!.releasePointerCapture(e.pointerId); } catch {}
    const url = canvasRef.current!.toDataURL("image/png");
    onChange(hasInkRef.current ? url : null);
  };
  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    hasInkRef.current = false;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="border border-border rounded-lg bg-white relative">
        <canvas
          ref={canvasRef}
          style={{ height, width: "100%", touchAction: "none", display: "block", cursor: "crosshair" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {!hasInk && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none select-none">
            Hier unterschreiben
          </span>
        )}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={clear}>
        <Eraser className="h-3 w-3 mr-1" /> Löschen
      </Button>
    </div>
  );
};
