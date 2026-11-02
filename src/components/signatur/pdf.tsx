/**
 * PDF-Anzeige (react-pdf) für die Unterschriften-Oberflächen — verzögert
 * geladen, Worker-Pfad wie in SignPdfDialog (sonst „fake worker failed“).
 */
import { lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { pdfjs } from "react-pdf";

const PDF_WORKER_SRC = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
const loadReactPdf = () =>
  import("react-pdf").then((m) => {
    m.pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
    return m;
  });
export const PdfDocument = lazy(() => loadReactPdf().then((m) => ({ default: m.Document })));
export const PdfPage = lazy(() => loadReactPdf().then((m) => ({ default: m.Page })));
pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;

/** Seitengrößen (PDF-Punkte) nach dem Laden ermitteln. */
export async function seitenGroessen(pdf: any): Promise<{ w: number; h: number }[]> {
  const sizes: { w: number; h: number }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    sizes.push({ w: vp.width, h: vp.height });
  }
  return sizes;
}

/** Breite eines Elements verfolgen. */
export function useElementBreite<T extends HTMLElement>() {
  const [breite, setBreite] = useState(0);
  const obs = useRef<ResizeObserver | null>(null);
  const elRef = useRef<T | null>(null);
  const ref = useCallback((el: T | null) => {
    obs.current?.disconnect();
    elRef.current = el;
    if (!el) return;
    const ro = new ResizeObserver(() => setBreite(el.clientWidth));
    ro.observe(el);
    obs.current = ro;
    setBreite(el.clientWidth);
  }, []);
  return { ref, breite, el: elRef };
}

/** Rendert eine Seite erst, wenn sie in die Nähe des sichtbaren Bereichs kommt. */
export function LazySeite({
  width, height, rootEl, children, className,
}: { width: number; height: number; rootEl: HTMLElement | null; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: rootEl, rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootEl, visible]);
  return (
    <div ref={ref} className={className ?? "bg-white shadow-[0_2px_10px_rgba(0,0,0,0.12)]"} style={{ width, height, overflow: "hidden" }}>
      {visible ? children : null}
    </div>
  );
}
