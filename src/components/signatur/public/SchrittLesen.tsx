import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ArrowDown, Loader2 } from "lucide-react";
import { Fortschritt, Haken, Kopf, PrimaerButton, SekundaerButton, ueberschrift, Fusszeile, FehlerHinweis, knopfSpalte } from "./ui";
import { PdfAnsicht } from "@/components/shared/PdfAnsicht";
import { datum, type SignFeld, type SignInfo } from "./api";
import { FeldEditor, FelderEbene, OffeneListe, offeneFelder, wertVon, type Offen, type Werte } from "./Felder";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** Ab 641 px: große PDF-Anzeige; darunter die Handy-Ansicht laut Mockup. */
function useGrosseAnsicht() {
  const abfrage = "(min-width: 641px)";
  const [gross, setGross] = useState(() => typeof window !== "undefined" && window.matchMedia(abfrage).matches);
  useEffect(() => {
    const m = window.matchMedia(abfrage);
    const f = () => setGross(m.matches);
    m.addEventListener("change", f);
    f();
    return () => m.removeEventListener("change", f);
  }, []);
  return gross;
}

type Props = {
  info: SignInfo;
  gelesen: boolean;
  setGelesen: (v: boolean) => void;
  onWeiter: () => void;
  onPapier: () => void;
  onDownload: () => void;
  downloadFehler: string | null;
  /** Eingaben in Ausfüllfelder (Feld-ID → Wert) */
  werte: Werte;
  setWert: (f: SignFeld, wert: string | null) => void;
};

/** Schritt 1 · Dokument lesen (Mockup v04, ohne „Änderung anfragen“). */
export default function SchrittLesen({ info, gelesen, setGelesen, onWeiter, onPapier, onDownload, downloadFehler, werte, setWert }: Props) {
  const felder = info.felder ?? [];
  const offen = offeneFelder(felder, werte);
  const [aktivId, setAktivId] = useState<string | null>(null);
  const [editor, setEditor] = useState<SignFeld | null>(null);
  const [ziel, setZiel] = useState<{ seite: number; y: number; n: number } | null>(null);
  const [seitenBreite, setSeitenBreite] = useState<Record<number, number>>({});
  const seitenEls = useRef<(HTMLDivElement | null)[]>([]);
  const [felderHinweis, setFelderHinweis] = useState(false);
  const eigeneAnzahl = felder.filter((f) => f.eigen).length;
  const box = useRef<HTMLDivElement>(null);
  const ende = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(358);
  const [seiten, setSeiten] = useState(0);
  const [gerendert, setGerendert] = useState(0);
  const [ladeFehler, setLadeFehler] = useState(false);
  const [hinweis, setHinweis] = useState(false);
  const gross = useGrosseAnsicht();
  const [grossFehler, setGrossFehler] = useState(false);
  const endeErreicht = useCallback(() => {
    setGelesen(true);
    setHinweis(false);
  }, [setGelesen]);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setBreite(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [gross, grossFehler]);

  // „Bis zum Ende gelesen“, sobald das Ende der letzten Seite sichtbar war.
  useEffect(() => {
    if ((gross && !grossFehler) || gelesen || !ende.current || !box.current || seiten === 0 || gerendert < seiten) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setGelesen(true);
          setHinweis(false);
          io.disconnect();
        }
      },
      { root: box.current.parentElement, threshold: 0 },
    );
    io.observe(ende.current);
    return () => io.disconnect();
  }, [seiten, gerendert, gelesen, setGelesen, gross, grossFehler]);

  // Sobald zu Ende gelesen: „Weiter zur Unterschrift“ sanft ins Bild holen,
  // falls jemand nicht merkt, dass nur im Dokument-Kasten gescrollt wurde.
  const knoepfe = useRef<HTMLDivElement>(null);
  const warGelesen = useRef(gelesen);
  useEffect(() => {
    if (gelesen && !warGelesen.current && knoepfe.current) {
      const r = knoepfe.current.getBoundingClientRect();
      if (r.bottom > window.innerHeight) {
        window.setTimeout(() => knoepfe.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 350);
      }
    }
    warGelesen.current = gelesen;
  }, [gelesen]);

  /** Zum Feld springen (große Ansicht: PdfAnsicht, Handy: eigene Liste) und hervorheben. */
  const springe = (o: Offen) => {
    const f = o.feld;
    setAktivId(f.id);
    setFelderHinweis(false);
    if (gross && !grossFehler) {
      setZiel((z) => ({ seite: f.page + 1, y: f.y, n: (z?.n ?? 0) + 1 }));
    } else {
      const el = seitenEls.current[f.page];
      const scroller = box.current?.parentElement;
      const sk = seitenBreite[f.page] ? breite / seitenBreite[f.page] : 1;
      if (el && scroller) scroller.scrollTo({ top: Math.max(0, el.offsetTop - scroller.offsetTop + f.y * sk - scroller.clientHeight / 3), behavior: "smooth" });
      // auch die Seite selbst, falls der Kasten nicht ganz sichtbar ist
      scroller?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (f.typ === "datum" || f.typ === "text") window.setTimeout(() => setEditor(f), 350);
  };
  const ebene = (seite: number, sk: number) => (
    <FelderEbene
      felder={felder}
      werte={werte}
      seite={seite}
      scale={sk}
      aktivId={aktivId}
      onWert={(f, w) => { setAktivId(f.id); setWert(f, w); }}
      onBearbeiten={(f) => { setAktivId(f.id); setEditor(f); }}
    />
  );

  const n = info.seitenzahl || seiten;
  const zeile = [info.objekt, n ? `${n} ${n === 1 ? "Seite" : "Seiten"}` : null, info.frist ? `Frist ${datum(info.frist)}` : null].filter(Boolean).join(" · ");

  const weiter = () => {
    if (!gelesen) {
      setHinweis(true);
      box.current?.parentElement?.scrollBy({ top: 400, behavior: "smooth" });
      return;
    }
    if (offen.length) {
      setFelderHinweis(true);
      springe(offen[0]);
      return;
    }
    onWeiter();
  };
  const bereit = gelesen && !offen.length;

  return (
    <>
      <Kopf links="sicher" />
      <div className="flex flex-1 flex-col">
        <Fortschritt schritt={1} />
        <div className="px-5 pb-[11px] pt-[11px] min-[641px]:px-10 min-[641px]:pb-4 min-[641px]:pt-5">
          <h1 className={`${ueberschrift} text-[20px] leading-[25px] min-[641px]:text-[26px] min-[641px]:leading-[32px]`}>{info.titel}</h1>
          <p className="mt-0 text-[13px] leading-[17px] text-[#6B6B6B] min-[641px]:mt-1 min-[641px]:text-[14px]">{zeile}</p>
        </div>

        <div className="border-b border-[#EEEEEE] bg-[#E9E9E7] px-4 pt-4 min-[641px]:px-6">
          {gross && info.pdf_url && !grossFehler ? (
            <div className="h-[max(600px,calc(100dvh-260px))] overflow-hidden rounded-[6px]" aria-label="Dokument">
              <PdfAnsicht
                quelle={info.pdf_url}
                dateiName={`${info.titel || "Dokument"}.pdf`}
                download={false}
                onEndeErreicht={endeErreicht}
                scrollWeitergeben
                onFehler={() => setGrossFehler(true)}
                className="bg-[#E9E9E7]"
                overlay={felder.length ? ebene : undefined}
                ziel={ziel}
              />
            </div>
          ) : (
          <div className="h-[min(420px,58dvh)] overflow-y-auto overscroll-auto [scrollbar-width:thin]" aria-label="Dokument">
            <div ref={box} className="w-full">
              {info.pdf_url && !ladeFehler ? (
                <Document
                  file={info.pdf_url}
                  onLoadSuccess={({ numPages }) => setSeiten(numPages)}
                  onLoadError={() => setLadeFehler(true)}
                  loading={
                    <div className="flex h-[420px] items-center justify-center bg-white">
                      <Loader2 className="h-6 w-6 animate-spin text-[#6B6B6B]" />
                    </div>
                  }
                >
                  <div className="flex flex-col gap-3">
                    {Array.from({ length: seiten }, (_, i) => (
                      <div key={i} ref={(el) => { seitenEls.current[i] = el; }} className="relative">
                        <Page
                          pageNumber={i + 1}
                          width={breite}
                          className="overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                          renderAnnotationLayer={false}
                          renderTextLayer={false}
                          onLoadSuccess={(pg: any) => {
                            const w = pg?.getViewport?.({ scale: 1 })?.width ?? pg?.originalWidth;
                            if (w) setSeitenBreite((b) => (b[i] === w ? b : { ...b, [i]: w }));
                          }}
                          onRenderSuccess={() => setGerendert((g) => g + 1)}
                          loading={<div className="bg-white" style={{ width: breite, height: Math.round(breite * 1.414) }} />}
                        />
                        {felder.length > 0 && seitenBreite[i] && (
                          <div className="pointer-events-none absolute inset-0 z-[3]">{ebene(i, breite / seitenBreite[i])}</div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div ref={ende} className="h-px w-full" />
                </Document>
              ) : (
                <div className="flex h-[300px] flex-col items-center justify-center gap-2 bg-white px-6 text-center text-[13px] leading-[19px] text-[#595959]">
                  <p>Die Vorschau kann auf diesem Gerät nicht angezeigt werden.</p>
                  <p>
                    Bitte öffnen Sie das Dokument über{" "}
                    <button type="button" className="text-[#B35300] underline underline-offset-2" onClick={() => { setGelesen(true); onDownload(); }}>
                      PDF herunterladen
                    </button>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
          )}
          <div className="flex items-center justify-between gap-3 pb-[20px] pt-[11px] text-[13px] leading-[18px] min-[641px]:text-[14px]">
            {gelesen ? (
              <span className="flex items-center gap-1 font-semibold text-[#1E6B34]">
                <Haken className="h-[13px] w-[13px]" strich={3} /> Bis zum Ende gelesen
              </span>
            ) : (
              <span className={`flex items-center gap-1 ${hinweis ? "font-semibold text-[#B35300]" : "text-[#6B6B6B]"}`}>
                <ArrowDown className="h-[13px] w-[13px]" /> Bitte zuerst bis zum Ende lesen
              </span>
            )}
            <button type="button" onClick={onDownload} className="shrink-0 text-[#B35300] underline underline-offset-2">
              PDF herunterladen
            </button>
          </div>
        </div>

        <div ref={knoepfe} className={`space-y-2 px-5 pt-[15px] min-[641px]:w-full min-[641px]:pt-6 ${knopfSpalte}`}>
          {eigeneAnzahl > 0 && !offen.length && (
            <p className="flex items-center gap-1 text-[13px] font-semibold leading-[18px] text-[#1E6B34]">
              <Haken className="h-[13px] w-[13px]" strich={3} /> Alle Angaben im Dokument ausgefüllt
            </p>
          )}
          {eigeneAnzahl > 0 && offen.length > 0 && (
            <>
              <p className={`text-[13px] leading-[18px] ${felderHinweis ? "font-semibold text-[#B35300]" : "text-[#595959]"}`}>
                Bitte füllen Sie die orange markierten Stellen direkt im Dokument aus.
              </p>
              <OffeneListe offen={offen} onSprung={springe} />
            </>
          )}
          {downloadFehler && <FehlerHinweis>{downloadFehler}</FehlerHinweis>}
          <PrimaerButton
            onClick={weiter}
            aria-disabled={!bereit}
            className={bereit ? "" : "bg-[#B35300]/45 hover:bg-[#B35300]/45"}
          >
            Weiter zur Unterschrift
          </PrimaerButton>
          {info.papier_erlaubt !== false && <SekundaerButton onClick={onPapier}>Lieber auf Papier unterschreiben</SekundaerButton>}
        </div>
        <Fusszeile className="mt-auto" />
      </div>
      {editor && (
        <FeldEditor
          feld={editor}
          wert={wertVon(editor, werte)}
          onWert={(w) => setWert(editor, w)}
          onSchliessen={() => setEditor(null)}
        />
      )}
    </>
  );
}
