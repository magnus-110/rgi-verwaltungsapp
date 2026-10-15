import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Zeigt alle Seiten eines PDFs untereinander, so breit wie der Platz.
 * Gezeichnet mit pdf.js – funktioniert auch, wenn der Browser PDFs sonst
 * herunterlädt statt sie anzuzeigen.
 */
export default function PdfSeiten({ datei, onFehler }: { datei: Blob; onFehler?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(600);
  const [seiten, setSeiten] = useState(0);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setBreite(Math.max(240, Math.floor(e.contentRect.width) - 32)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} className="h-full w-full overflow-y-auto p-4">
      <Document
        file={datei}
        onLoadSuccess={({ numPages }) => setSeiten(numPages)}
        onLoadError={() => onFehler?.()}
        loading={
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <div className="mx-auto flex flex-col items-center gap-4">
          {Array.from({ length: seiten }, (_, i) => (
            <Page key={i} pageNumber={i + 1} width={breite} className="overflow-hidden rounded-md shadow-sm" renderAnnotationLayer={false} renderTextLayer={false} />
          ))}
        </div>
      </Document>
    </div>
  );
}
