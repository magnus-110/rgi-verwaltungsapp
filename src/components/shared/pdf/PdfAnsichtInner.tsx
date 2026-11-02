/**
 * Die eigentliche PDF-Anzeige (react-pdf). Wird über PdfAnsicht verzögert
 * geladen, damit pdf.js nur dort geladen wird, wo ein PDF gezeigt wird.
 *
 * - alle Seiten untereinander als weiße Blätter auf grauem Grund
 * - Breite passt sich an (Desktop und Handy, ohne waagrechtes Scrollen)
 * - nur Seiten in der Nähe des sichtbaren Bereichs werden gezeichnet
 * - dezente Leiste: Seite x / y, Zoom −/+, Breite anpassen, Herunterladen
 * - Text auswählbar (Textebene), Links anklickbar
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { AlertCircle, Download, Loader2, MoveHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDateiBlob, type DateiQuelle } from "./datei";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Worker wie in den übrigen Komponenten (CDN, passende Version).
// Nach dem Import setzen – react-pdf setzt beim Laden sonst einen eigenen Pfad.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** Schriften/Zeichentabellen für PDFs ohne eingebettete Schriften (z. B. manche Rechnungen). */
const PDF_OPTIONEN = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
/** Obergrenze im Normalfall, damit eine A4-Seite am großen Bildschirm nicht riesig wird. */
const AUTO_MAX = 1.35;
const ABSTAND = 16; // px zwischen den Seiten

type Zoom = "auto" | "breite" | number;

export interface PdfAnsichtProps {
  /** PDF als Blob/File (bevorzugt) oder Adresse */
  quelle: DateiQuelle;
  /** Dateiname für „Herunterladen“ */
  dateiName?: string;
  /** Zu dieser Seite springen (1 = erste Seite) */
  startSeite?: number;
  className?: string;
  /** Leiste (Seitenzahl, Zoom, Download) zeigen – Standard: ja */
  leiste?: boolean;
  /** Herunterladen-Knopf in der Leiste – Standard: ja */
  download?: boolean;
  onFehler?: (meldung: string) => void;
  /** Wird einmal aufgerufen, sobald bis zum Ende gescrollt wurde (oder alles auf einmal sichtbar ist). */
  onEndeErreicht?: () => void;
}

function Laden({ text = "PDF wird geladen …" }: { text?: string }) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-[13px] text-[#6B6B6B]">
      <Loader2 className="h-6 w-6 animate-spin" />
      {text}
    </div>
  );
}

export default function PdfAnsichtInner({
  quelle, dateiName, startSeite, className, leiste = true, download = true, onFehler, onEndeErreicht,
}: PdfAnsichtProps) {
  const datei = useDateiBlob(quelle, { dateiName, mimeType: "application/pdf" });
  const name = dateiName || (quelle instanceof File ? quelle.name : "") || "Dokument.pdf";
  const downloadName = /\.pdf$/i.test(name) ? name : `${name}.pdf`;

  // ---------- Platz messen ----------
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [breite, setBreite] = useState(0);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const scrollBox = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    setScrollEl(el);
  }, []);
  useEffect(() => {
    if (!scrollEl) return;
    const ro = new ResizeObserver(() => setBreite(scrollEl.clientWidth));
    ro.observe(scrollEl);
    setBreite(scrollEl.clientWidth);
    return () => ro.disconnect();
  }, [scrollEl]);

  // ---------- Seiten ----------
  const [seiten, setSeiten] = useState<{ w: number; h: number }[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>("auto");
  const [aktuelleSeite, setAktuelleSeite] = useState(1);
  useEffect(() => {
    setSeiten([]);
    setFehler(null);
    setZoom("auto");
    setAktuelleSeite(1);
  }, [datei.blob]);

  const rand = breite > 0 && breite < 640 ? 8 : 24; // Abstand links/rechts
  const maxW = useMemo(() => Math.max(1, ...seiten.map((s) => s.w)), [seiten]);
  const fit = breite > 0 ? Math.max(MIN_SCALE, (breite - 2 * rand) / maxW) : 1;
  const scale = zoom === "auto" ? Math.min(fit, AUTO_MAX) : zoom === "breite" ? fit : zoom;

  const fehlerMelden = useCallback((m: string) => {
    setFehler(m);
    onFehler?.(m);
  }, [onFehler]);

  useEffect(() => {
    if (datei.fehler) fehlerMelden(datei.fehler);
  }, [datei.fehler, fehlerMelden]);

  const onLoad = useCallback(async (pdf: any) => {
    try {
      const groessen = await Promise.all(
        Array.from({ length: pdf.numPages }, async (_, i) => {
          const p = await pdf.getPage(i + 1);
          const vp = p.getViewport({ scale: 1 });
          return { w: vp.width, h: vp.height };
        }),
      );
      setSeiten(groessen);
    } catch (e: any) {
      fehlerMelden(e?.message || "PDF konnte nicht gelesen werden.");
    }
  }, [fehlerMelden]);

  // ---------- Leseposition beim Zoomen halten ----------
  const letzteScale = useRef(scale);
  const position = useRef<{ y: number; x: number } | null>(null);
  const merkePosition = () => {
    const el = scrollRef.current;
    if (!el || !el.scrollHeight) return;
    position.current = {
      y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
      x: el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5,
    };
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && position.current && letzteScale.current !== scale) {
      el.scrollTop = position.current.y * el.scrollHeight - el.clientHeight / 2;
      el.scrollLeft = position.current.x * el.scrollWidth - el.clientWidth / 2;
    }
    position.current = null;
    letzteScale.current = scale;
  }, [scale]);

  const zoomen = (z: Zoom) => {
    merkePosition();
    setZoom(z);
  };
  const plus = () => zoomen(Math.min(MAX_SCALE, scale * 1.25));
  const minus = () => zoomen(Math.max(MIN_SCALE, scale / 1.25));

  // ---------- Aktuelle Seite (beim Scrollen) ----------
  const seitenEls = useRef<(HTMLDivElement | null)[]>([]);
  const raf = useRef(0);
  const endeGemeldet = useRef(false);
  const endePruefen = useCallback(() => {
    const el = scrollRef.current;
    if (!el || endeGemeldet.current || !onEndeErreicht) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      endeGemeldet.current = true;
      onEndeErreicht();
    }
  }, [onEndeErreicht]);
  useEffect(() => {
    endeGemeldet.current = false;
  }, [datei.blob]);
  // Kurzes PDF, das ganz hineinpasst: gilt sofort als gelesen
  useEffect(() => {
    if (!seiten.length) return;
    const t = window.setTimeout(endePruefen, 150);
    return () => window.clearTimeout(t);
  }, [seiten, scale, endePruefen]);
  const onScroll = () => {
    endePruefen();
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const mitte = el.scrollTop + el.clientHeight * 0.35;
      let nr = 1;
      seitenEls.current.forEach((s, i) => {
        if (s && s.offsetTop <= mitte) nr = i + 1;
      });
      setAktuelleSeite(nr);
    });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // ---------- Startseite ----------
  const gesprungen = useRef(false);
  useEffect(() => {
    gesprungen.current = false;
  }, [datei.blob, startSeite]);
  useEffect(() => {
    if (gesprungen.current || !seiten.length || !startSeite || startSeite <= 1 || breite === 0) return;
    const ziel = seitenEls.current[Math.min(startSeite, seiten.length) - 1];
    const el = scrollRef.current;
    if (ziel && el) {
      el.scrollTop = ziel.offsetTop - ABSTAND;
      gesprungen.current = true;
    }
  }, [seiten, startSeite, breite]);

  const zeigeFehler = !!fehler || (!!datei.fehler && !datei.blob);
  const downloadUrl = datei.url;

  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#EDEDED]", className)}>
      <div
        ref={scrollBox}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {zeigeFehler ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
            <AlertCircle className="h-8 w-8 text-[#B35300]" />
            <div className="text-[14px] font-semibold text-[#2B2B2B]">Das PDF kann hier nicht angezeigt werden.</div>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={downloadName}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#D6D6D6] bg-white px-4 text-[14px] font-semibold text-[#2B2B2B] hover:bg-[#FAFAFA]"
              >
                <Download className="h-4 w-4" /> PDF herunterladen
              </a>
            )}
          </div>
        ) : !datei.blob ? (
          <Laden />
        ) : (
          <Document
            file={datei.blob}
            options={PDF_OPTIONEN}
            onLoadSuccess={onLoad}
            onLoadError={(e: Error) => fehlerMelden(e?.message || "PDF konnte nicht gelesen werden.")}
            onSourceError={(e: Error) => fehlerMelden(e?.message || "PDF konnte nicht gelesen werden.")}
            loading={<Laden />}
            error={<span />}
            className="mx-auto flex w-max min-w-full flex-col items-center"
          >
            {seiten.length === 0 ? (
              <Laden />
            ) : (
              <div className="flex flex-col items-center" style={{ gap: ABSTAND, padding: `${ABSTAND}px ${rand}px ${leiste ? 72 : ABSTAND}px` }}>
                {seiten.map((s, i) => (
                  <div key={i} ref={(el) => { seitenEls.current[i] = el; }}>
                    <Seite nr={i + 1} breite={s.w * scale} hoehe={s.h * scale} root={scrollEl} />
                  </div>
                ))}
              </div>
            )}
          </Document>
        )}
      </div>

      {leiste && datei.blob && !zeigeFehler && seiten.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-black/10 bg-white/95 px-1.5 py-1 text-[12.5px] text-[#2B2B2B] shadow-[0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur">
            <span className="px-2 tabular-nums text-[#595959]" aria-live="polite">
              Seite {aktuelleSeite} / {seiten.length}
            </span>
            <span className="mx-0.5 h-5 w-px bg-black/10" />
            <LeistenKnopf titel="Verkleinern" onClick={minus} disabled={scale <= MIN_SCALE + 0.001}>
              <ZoomOut className="h-4 w-4" />
            </LeistenKnopf>
            <button
              type="button"
              onClick={() => zoomen("auto")}
              title="Zoom zurücksetzen"
              className="hidden h-8 min-w-[46px] rounded-full px-1 tabular-nums text-[#595959] hover:bg-black/5 sm:block"
            >
              {Math.round(scale * 100)} %
            </button>
            <LeistenKnopf titel="Vergrößern" onClick={plus} disabled={scale >= MAX_SCALE - 0.001}>
              <ZoomIn className="h-4 w-4" />
            </LeistenKnopf>
            <LeistenKnopf titel="Breite anpassen" onClick={() => zoomen("breite")} aktiv={zoom === "breite"}>
              <MoveHorizontal className="h-4 w-4" />
            </LeistenKnopf>
            {download && downloadUrl && (
              <>
                <span className="mx-0.5 h-5 w-px bg-black/10" />
                <a
                  href={downloadUrl}
                  download={downloadName}
                  title="PDF herunterladen"
                  aria-label="PDF herunterladen"
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 sm:h-8 sm:w-8"
                >
                  <Download className="h-4 w-4" />
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LeistenKnopf({
  titel, onClick, disabled, aktiv, children,
}: { titel: string; onClick: () => void; disabled?: boolean; aktiv?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titel}
      aria-label={titel}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/5 disabled:opacity-35 disabled:hover:bg-transparent sm:h-8 sm:w-8",
        aktiv && "bg-[#FFF7ED] text-[#B35300]",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Eine Seite: fester Platzhalter in Seitengröße; gezeichnet wird nur,
 * wenn sie in der Nähe des sichtbaren Bereichs ist (spart Speicher bei langen PDFs).
 */
const Seite = memo(function Seite({ nr, breite, hoehe, root }: { nr: number; breite: number; hoehe: number; root: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [sichtbar, setSichtbar] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !root) return;
    const io = new IntersectionObserver((e) => setSichtbar(e.some((x) => x.isIntersecting)), {
      root,
      rootMargin: "1200px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);
  return (
    <div
      ref={ref}
      className="relative bg-white shadow-[0_2px_10px_rgba(0,0,0,0.12)]"
      style={{ width: breite, height: hoehe, overflow: "hidden" }}
      data-seite={nr}
    >
      {sichtbar && (
        <Page
          pageNumber={nr}
          width={breite}
          renderTextLayer
          renderAnnotationLayer
          loading={<div style={{ width: breite, height: hoehe }} className="bg-white" />}
          error={<div className="flex h-full items-center justify-center text-[12px] text-[#6B6B6B]">Seite {nr} konnte nicht gezeichnet werden.</div>}
        />
      )}
    </div>
  );
});
