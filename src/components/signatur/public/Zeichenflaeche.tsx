/**
 * Zeichenfläche für die öffentliche Unterschriftsseite.
 *
 * - füllt den Platz des Elternelements (Breite und Höhe)
 * - beim Drehen/Größenändern bleibt das Gezeichnete erhalten (wird skaliert)
 * - kein Scrollen/Neuladen durch Wischen auf der Fläche
 *   (touch-action: none + touchmove mit preventDefault, passive: false)
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface ZeichenflaecheRef {
  loeschen: () => void;
}

const FARBE = "#0a0a0a";

export const Zeichenflaeche = forwardRef<ZeichenflaecheRef, { onChange: (png: string | null) => void; value?: string | null }>(
  function Zeichenflaeche({ onChange, value }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const groesse = useRef({ w: 0, h: 0 });
    const zeichnet = useRef(false);
    const letzter = useRef<{ x: number; y: number } | null>(null);
    const tinte = useRef(false);
    const [hatTinte, setHatTinte] = useState(!!value);

    const stil = (ctx: CanvasRenderingContext2D, ratio: number) => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.strokeStyle = FARBE;
      ctx.fillStyle = FARBE;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    /** Canvas an die aktuelle Größe anpassen; vorhandene Striche skaliert übernehmen. */
    const anpassen = useCallback(() => {
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const alt = groesse.current;
      if (Math.abs(alt.w - r.width) < 0.5 && Math.abs(alt.h - r.height) < 0.5) return;
      const ratio = window.devicePixelRatio || 1;
      // Bisheriges Bild sichern
      let kopie: HTMLCanvasElement | null = null;
      if (tinte.current && c.width && c.height) {
        kopie = document.createElement("canvas");
        kopie.width = c.width;
        kopie.height = c.height;
        kopie.getContext("2d")!.drawImage(c, 0, 0);
      }
      c.width = Math.round(r.width * ratio);
      c.height = Math.round(r.height * ratio);
      const ctx = c.getContext("2d")!;
      stil(ctx, ratio);
      if (kopie && alt.w && alt.h) {
        // gleichmäßig skalieren (keine Verzerrung), mittig
        const f = Math.min(r.width / alt.w, r.height / alt.h);
        const w = alt.w * f;
        const h = alt.h * f;
        ctx.drawImage(kopie, (r.width - w) / 2, (r.height - h) / 2, w, h);
      }
      groesse.current = { w: r.width, h: r.height };
    }, []);

    useEffect(() => {
      const c = canvasRef.current;
      if (!c) return;
      anpassen();
      // Bereits gezeichnete Unterschrift (z. B. nach „Zurück“) wieder anzeigen
      if (value && groesse.current.w) {
        const img = new Image();
        img.onload = () => {
          const { w, h } = groesse.current;
          const f = Math.min(w / (img.width / (window.devicePixelRatio || 1)), h / (img.height / (window.devicePixelRatio || 1)), 1);
          const iw = (img.width / (window.devicePixelRatio || 1)) * f;
          const ih = (img.height / (window.devicePixelRatio || 1)) * f;
          c.getContext("2d")!.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
          tinte.current = true;
        };
        img.src = value;
      }
      const ro = new ResizeObserver(() => anpassen());
      ro.observe(c);
      // iOS: Wischen auf der Fläche darf die Seite nicht bewegen/neu laden
      const halt = (e: TouchEvent) => e.preventDefault();
      c.addEventListener("touchmove", halt, { passive: false });
      c.addEventListener("touchstart", halt, { passive: false });
      return () => {
        ro.disconnect();
        c.removeEventListener("touchmove", halt);
        c.removeEventListener("touchstart", halt);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anpassen]);

    const pos = (e: React.PointerEvent) => {
      const r = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const start = (e: React.PointerEvent) => {
      e.preventDefault();
      const c = canvasRef.current!;
      try { c.setPointerCapture(e.pointerId); } catch { /* egal */ }
      zeichnet.current = true;
      const { x, y } = pos(e);
      letzter.current = { x, y };
      const ctx = c.getContext("2d")!;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
      tinte.current = true;
      setHatTinte(true);
    };
    const bewegen = (e: React.PointerEvent) => {
      if (!zeichnet.current) return;
      e.preventDefault();
      const ctx = canvasRef.current!.getContext("2d")!;
      const { x, y } = pos(e);
      const l = letzter.current ?? { x, y };
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      letzter.current = { x, y };
    };
    const ende = (e: React.PointerEvent) => {
      if (!zeichnet.current) return;
      zeichnet.current = false;
      letzter.current = null;
      try { canvasRef.current!.releasePointerCapture(e.pointerId); } catch { /* egal */ }
      onChange(tinte.current ? canvasRef.current!.toDataURL("image/png") : null);
    };

    useImperativeHandle(ref, () => ({
      loeschen: () => {
        const c = canvasRef.current;
        if (c) {
          const ctx = c.getContext("2d")!;
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.restore();
        }
        tinte.current = false;
        setHatTinte(false);
        onChange(null);
      },
    }), [onChange]);

    return (
      <div className="relative h-full w-full">
        <canvas
          ref={canvasRef}
          aria-label="Unterschrift zeichnen"
          className="block h-full w-full cursor-crosshair"
          style={{ touchAction: "none", overscrollBehavior: "contain" }}
          onPointerDown={start}
          onPointerMove={bewegen}
          onPointerUp={ende}
          onPointerCancel={ende}
        />
        {!hatTinte && (
          <span className="pointer-events-none absolute inset-0 flex select-none items-center justify-center pb-6 text-[13px] text-[#8A8A8A]">
            Hier unterschreiben
          </span>
        )}
      </div>
    );
  },
);
