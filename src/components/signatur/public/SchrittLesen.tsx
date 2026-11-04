import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ArrowDown, Loader2 } from "lucide-react";
import { Fortschritt, Haken, Kopf, PrimaerButton, SekundaerButton, ueberschrift, Fusszeile, FehlerHinweis, knopfSpalte } from "./ui";
import { PdfAnsicht } from "@/components/shared/PdfAnsicht";
import { cn } from "@/lib/utils";
import { zeileAusBereich } from "@shared/signatur/ersetzung.ts";
import { datum, type Rechteck, type SignErgaenzung, type SignFeld, type SignInfo } from "./api";
import { FelderEbene, type Werte } from "./Felder";
import {
  A4, ErgaenzenLeiste, ErgaenzungenEbene, MAX_ERGAENZUNGEN, MAX_ZEILEN, neueErgaenzung, textHoehe, textSauber, type Modus,
} from "./Ergaenzungen";
import Formular, { ErsetzungenSvg, eintraege, eintragFehler, ersetzungenVorschau } from "./Formular";
import {
  abschnittVon, angrenzend, auswahlMit, auswahlText, auswahlZeilen, freiBerechnen, hatText, textLaden, wortBei,
  type SeiteText, type Wort,
} from "../textEbene";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** Ab 641 px: große PDF-Anzeige; darunter die Handy-Ansicht laut Mockup. */
function useMedia(abfrage: string) {
  const [an, setAn] = useState(() => typeof window !== "undefined" && window.matchMedia(abfrage).matches);
  useEffect(() => {
    const m = window.matchMedia(abfrage);
    const f = () => setAn(m.matches);
    m.addEventListener("change", f);
    f();
    return () => m.removeEventListener("change", f);
  }, [abfrage]);
  return an;
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
  /** Eigene Ergänzungen/Korrekturen (nur mit Freigabe), gehen mit der Unterschrift an sign-public */
  ergaenzungen: SignErgaenzung[];
  setErgaenzungen: React.Dispatch<React.SetStateAction<SignErgaenzung[]>>;
};

const neueId = () => `k${Math.random().toString(36).slice(2, 10)}`;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Meldet die Größe der Seite (pt) an die Ersetzungs-Vorschau. */
function Messer({ seite, scale, onMass }: { seite: number; scale: number; onMass: (seite: number, m: { w: number; h: number }) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const r = ref.current?.parentElement?.getBoundingClientRect();
    if (r && r.width > 0 && scale > 0) onMass(seite, { w: r.width / scale, h: r.height / scale });
  });
  return <span ref={ref} className="hidden" />;
}

/** Schritt 1 · Dokument lesen und Angaben im Formular ausfüllen (Mockup v04, ohne „Änderung anfragen“). */
export default function SchrittLesen({ info, gelesen, setGelesen, onWeiter, onPapier, onDownload, downloadFehler, werte, setWert, ergaenzungen, setErgaenzungen }: Props) {
  const felder = useMemo(() => info.felder ?? [], [info.felder]);
  const [aktivId, setAktivId] = useState<string | null>(null);
  const [ziel, setZiel] = useState<{ seite: number; y: number; n: number } | null>(null);
  const [seitenBreite, setSeitenBreite] = useState<Record<number, number>>({});
  const seitenEls = useRef<(HTMLDivElement | null)[]>([]);
  const [pruefen, setPruefen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const ende = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(358);
  const [seiten, setSeiten] = useState(0);
  const [gerendert, setGerendert] = useState(0);
  const [ladeFehler, setLadeFehler] = useState(false);
  const [hinweis, setHinweis] = useState(false);
  const gross = useMedia("(min-width: 641px)");
  const nebeneinander = useMedia("(min-width: 1024px)");
  const [grossFehler, setGrossFehler] = useState(false);
  const pdfGross = gross && !grossFehler && !!info.pdf_url;
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
    if (pdfGross || gelesen || !ende.current || !box.current || seiten === 0 || gerendert < seiten) return;
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
  }, [seiten, gerendert, gelesen, setGelesen, pdfGross]);

  const knoepfe = useRef<HTMLDivElement>(null);
  const warGelesen = useRef(gelesen);
  useEffect(() => {
    if (gelesen && !warGelesen.current && knoepfe.current && !felder.some((f) => f.eigen)) {
      const r = knoepfe.current.getBoundingClientRect();
      if (r.bottom > window.innerHeight) {
        window.setTimeout(() => knoepfe.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 350);
      }
    }
    warGelesen.current = gelesen;
  }, [gelesen, felder]);

  /** Zu einer Stelle im PDF springen (große Ansicht: PdfAnsicht, Handy: eigene Liste). */
  const zeigeStelle = (page: number, y: number, kasten = true) => {
    if (pdfGross) {
      setZiel((z) => ({ seite: page + 1, y, n: (z?.n ?? 0) + 1 }));
    } else {
      const el = seitenEls.current[page];
      const scroller = box.current?.parentElement;
      const sk = seitenBreite[page] ? breite / seitenBreite[page] : 1;
      if (el && scroller) scroller.scrollTo({ top: Math.max(0, el.offsetTop - scroller.offsetTop + y * sk - scroller.clientHeight / 3), behavior: "smooth" });
      if (kasten) scroller?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  // ---- Textebene (für Korrekturen per Antippen)
  const darf = !!info.darf_ergaenzen;
  const [text, setText] = useState<SeiteText[] | null>(null);
  useEffect(() => {
    if (!darf || !info.pdf_url) return;
    let aktiv = true;
    textLaden(info.pdf_url).then((t) => aktiv && setText(t));
    return () => { aktiv = false; };
  }, [darf, info.pdf_url]);
  const [masseSt, setMasseSt] = useState<Record<number, { w: number; h: number }>>({});
  const onMass = useCallback((seite: number, m: { w: number; h: number }) => {
    setMasseSt((alt) => (alt[seite] && Math.abs(alt[seite].w - m.w) < 0.5 && Math.abs(alt[seite].h - m.h) < 0.5 ? alt : { ...alt, [seite]: m }));
  }, []);
  const masse = (page: number) => (text?.[page] ? { w: text[page].w, h: text[page].h } : masseSt[page] ?? A4);
  const seitenMasse = useRef<Record<number, { w: number; h: number }>>({});

  // ---- Formular ↔ PDF
  const fokusEintrag = (id: string) => {
    setAktivId(id);
    const f = felder.find((x) => x.id === id);
    const e = ergaenzungen.find((x) => x.id === id);
    if (f) zeigeStelle(f.page, f.y, false);
    else if (e) zeigeStelle(e.page, e.zeilen?.[0]?.y ?? e.y, false);
  };
  /** Eingabefeld im Formular fokussieren (nach Klick im PDF). */
  const insFormular = (id: string) => {
    setAktivId(id);
    window.setTimeout(() => {
      const el = document.getElementById(`sig-in-${id}`) as HTMLInputElement | null;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: "smooth", block: nebeneinander ? "nearest" : "center" });
    }, 30);
  };

  // ---- Ergänzungen/Korrekturen (nur mit Freigabe durch RGI)
  const andere = info.ergaenzungen_andere ?? [];
  const [modus, setModusRoh] = useState<Modus>(null);
  const [korrArt, setKorrArt] = useState<"wort" | "zeile">("wort");
  const [markierId, setMarkierId] = useState<string | null>(null);
  const [ergAktiv, setErgAktiv] = useState<string | null>(null);
  const [kurzHinweis, setKurzHinweis] = useState<string | null>(null);
  const setModus = (m: Modus) => {
    setModusRoh(m);
    setKurzHinweis(null);
    if (!m && markierId) {
      // Abbrechen: neue Korrektur ohne Text verwerfen
      setErgaenzungen((l) => l.filter((e) => e.id !== markierId || !!textSauber(e.text)));
      setMarkierId(null);
    }
  };
  const markiert = ergaenzungen.find((e) => e.id === markierId) ?? null;
  const ohneText = text !== null && info.pdf_url != null && text.every((s) => !hatText(s));

  /** Korrektur aus markierten Wörtern (Textebene) setzen. */
  const korrekturAusWoertern = (seite: number, woerter: Wort[], id: string | null): string => {
    const S = text![seite];
    const zeilen = auswahlZeilen(woerter);
    const frei = freiBerechnen(S, woerter, zeilen);
    const x = Math.min(...zeilen.map((z) => z.x)), y = Math.min(...zeilen.map((z) => z.y));
    const bereich = { x: r1(x), y: r1(y), w: r1(Math.max(...zeilen.map((z) => z.x + z.w)) - x), h: r1(Math.max(...zeilen.map((z) => z.y + z.h)) - y) };
    const patch = { page: seite, zeilen, frei, original_text: auswahlText(woerter), woerter: woerter.map((w) => w.id), bereich, ...bereich };
    if (id) {
      setErgaenzungen((l) => l.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      return id;
    }
    const neu: SignErgaenzung = { id: neueId(), art: "korrektur", text: "", ...patch };
    setErgaenzungen((l) => [...l, neu]);
    return neu.id;
  };
  const korrekturTipp = (seite: number, p: { x: number; y: number }) => {
    const S = text?.[seite];
    if (!S) return;
    const w = wortBei(S, p.x, p.y);
    setKurzHinweis(null);
    if (!w) {
      setKurzHinweis("Hier wurde kein Text erkannt. Bitte direkt auf ein Wort tippen.");
      return;
    }
    if (markiert && markiert.page === seite && markiert.woerter?.length) {
      const auswahl = markiert.woerter.map((id) => S.woerter.find((x) => x.id === id)!).filter(Boolean);
      if (auswahl.some((x) => x.id === w.id)) {
        // Wort am Rand wieder abwählen
        if (auswahl.length > 1 && (auswahl[0].id === w.id || auswahl[auswahl.length - 1].id === w.id)) {
          korrekturAusWoertern(seite, auswahl.filter((x) => x.id !== w.id), markiert.id);
        }
        return;
      }
      if (angrenzend(S, auswahl, w)) {
        korrekturAusWoertern(seite, auswahlMit(S, auswahl, w), markiert.id);
        return;
      }
    }
    if (!markiert && ergaenzungen.length >= MAX_ERGAENZUNGEN) return;
    const woerter = korrArt === "zeile" ? abschnittVon(S, w) : [w];
    const id = korrekturAusWoertern(seite, woerter, markiert && markiert.page === seite ? markiert.id : null);
    if (markiert && markiert.page !== seite) {
      // andere Seite: bisherige Markierung bleibt als eigene Korrektur
      if (!textSauber(markiert.text)) setErgaenzungen((l) => l.filter((e) => e.id !== markiert.id));
    }
    setMarkierId(id);
    setAktivId(id);
  };
  const markierFertig = () => {
    const id = markierId;
    setModusRoh(null);
    setMarkierId(null);
    if (id) insFormular(id);
  };
  const korrMarkieren = (id: string) => {
    const e = ergaenzungen.find((x) => x.id === id);
    if (!e) return;
    if (!e.woerter?.length) {
      // Scan-Markierung: nur löschen/neu setzen möglich
      fokusEintrag(id);
      return;
    }
    setModusRoh("korrigieren");
    setMarkierId(id);
    setAktivId(id);
    zeigeStelle(e.page, e.zeilen?.[0]?.y ?? e.y);
  };

  /** Neue Ergänzung bzw. (Scan ohne Textebene) Korrektur per Rechteck. */
  const ergNeu = (seite: number, art: "ergaenzung" | "korrektur", p: { x: number; y: number }, bereich?: Rechteck) => {
    setModusRoh(null);
    if (ergaenzungen.length >= MAX_ERGAENZUNGEN) return;
    const m = masse(seite);
    let e: SignErgaenzung;
    if (art === "ergaenzung") {
      e = neueErgaenzung(seite, p.x, p.y, m);
    } else {
      const b = {
        x: r1(Math.max(0, Math.min(bereich!.x, m.w - bereich!.w))), y: r1(Math.max(0, Math.min(bereich!.y, m.h - bereich!.h))),
        w: r1(Math.min(bereich!.w, m.w)), h: r1(Math.min(bereich!.h, m.h)),
      };
      e = {
        id: neueId(), art: "korrektur", page: seite, text: "", bereich: b, ...b,
        zeilen: [zeileAusBereich(b)], frei: { bis: m.w - 14, oben: Math.max(0, b.y - 14), scan: true }, original_text: null,
      };
    }
    setErgaenzungen((l) => [...l, e]);
    setErgAktiv(art === "ergaenzung" ? e.id : null);
    zeigeStelle(seite, e.y);
    insFormular(e.id);
  };
  const ergAendern = (id: string, patch: Partial<SignErgaenzung>) =>
    setErgaenzungen((l) => l.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const ergText = (id: string, t: string) =>
    setErgaenzungen((l) => l.map((e) => {
      if (e.id !== id) return e;
      if (e.art === "korrektur") return { ...e, text: t };
      const m = masse(e.page);
      // Feld wächst mit dem Text (10 pt), höchstens bis zum Seitenende
      return { ...e, text: t, h: Math.max(16, Math.min(textHoehe(t, e.w), Math.floor(m.h - e.y - 2))) };
    }));
  const ergLoeschen = (id: string) => {
    setErgaenzungen((l) => l.filter((e) => e.id !== id));
    setErgAktiv((a) => (a === id ? null : a));
    setAktivId((a) => (a === id ? null : a));
    if (markierId === id) {
      setMarkierId(null);
      setModusRoh(null);
    }
  };

  const ersetzungen = ersetzungenVorschau(felder, werte, ergaenzungen, andere);
  const eigeneErg = ergaenzungen.filter((e) => !(e.art === "korrektur" && e.zeilen?.length));
  const andereAlt = andere.filter((e) => !(e.art === "korrektur" && e.zeilen?.length));
  const eigeneFelder = felder.filter((f) => f.eigen);
  const mitFormular = eigeneFelder.length > 0 || darf;

  const ebene = (seite: number, sk: number) => {
    const seiteHatText = hatText(text?.[seite]);
    const ergModus: Modus = !darf ? null : modus === "ergaenzen" ? "ergaenzen" : modus === "korrigieren" && text !== null && !seiteHatText ? "korrigieren" : null;
    return (
      <>
        <Messer seite={seite} scale={sk} onMass={onMass} />
        {felder.length > 0 && (
          <FelderEbene
            felder={felder}
            werte={werte}
            seite={seite}
            scale={sk}
            aktivId={aktivId}
            onWert={(f, w) => { setAktivId(f.id); setWert(f, w); }}
            onBearbeiten={(f) => insFormular(f.id)}
          />
        )}
        <ErsetzungenSvg liste={ersetzungen} seite={seite} scale={sk} groesse={masse(seite)} aktivKey={aktivId} onTipp={modus ? undefined : insFormular} />
        {(darf || andereAlt.length > 0) && (
          <ErgaenzungenEbene
            seite={seite}
            scale={sk}
            eigene={darf ? eigeneErg : []}
            andere={andereAlt}
            modus={ergModus}
            aktivId={ergAktiv}
            seitenMasse={seitenMasse}
            onNeu={ergNeu}
            onAendern={ergAendern}
            onWaehlen={(id) => { setErgAktiv(id); if (id) setAktivId(id); }}
            onBearbeiten={(id) => { setErgAktiv(id); insFormular(id); }}
            onLoeschen={ergLoeschen}
          />
        )}
        {darf && modus === "korrigieren" && seiteHatText && (
          <KorrekturFang
            seite={seite}
            scale={sk}
            markiert={markiert && markiert.page === seite ? markiert : null}
            onTipp={korrekturTipp}
          />
        )}
      </>
    );
  };

  const n = info.seitenzahl || seiten;
  const zeile = [info.objekt, n ? `${n} ${n === 1 ? "Seite" : "Seiten"}` : null, info.frist ? `Frist ${datum(info.frist)}` : null].filter(Boolean).join(" · ");

  // ---- Prüfen und weiter
  const offen = eintraege(felder, werte).filter((e) => eintragFehler(e, felder, werte));
  const ergOffen = ergaenzungen.filter((e) => !textSauber(e.text) || textSauber(e.text).split("\n").length > MAX_ZEILEN);
  const bereit = gelesen && !offen.length && !ergOffen.length;
  const weiter = () => {
    if (!gelesen) {
      setHinweis(true);
      if (pdfGross) setZiel((z) => ({ seite: n || 1, y: 0, n: (z?.n ?? 0) + 1 }));
      else box.current?.parentElement?.scrollBy({ top: 400, behavior: "smooth" });
      return;
    }
    if (offen.length || ergOffen.length) {
      setPruefen(true);
      const id = offen.length ? offen[0].felder[0].id : ergOffen[0].id;
      fokusEintrag(id);
      insFormular(id);
      return;
    }
    setModusRoh(null);
    setMarkierId(null);
    setErgAktiv(null);
    onWeiter();
  };

  // Modus „Korrigieren/Ergänzen“: Dokument ins Bild, Leiste sichtbar halten
  const leisteUnten = !!modus && !nebeneinander;
  useEffect(() => {
    if (!modus) return;
    if (nebeneinander) document.getElementById("sig-leiste")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    else document.getElementById("sig-pdf")?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modus]);
  useEffect(() => {
    if (modus && nebeneinander && markierId) document.getElementById("sig-leiste")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [markierId, modus, nebeneinander]);

  const leiste = darf ? (
    <div id="sig-leiste" className="space-y-2">
      <ErgaenzenLeiste
        modus={modus}
        setModus={(m) => { setModus(m); setErgAktiv(null); }}
        anzahl={ergaenzungen.length}
        gross={gross}
        korrArt={korrArt}
        setKorrArt={setKorrArt}
        markiert={modus === "korrigieren" ? markiert?.original_text ?? null : null}
        onMarkierFertig={markierFertig}
        scan={ohneText}
      />
      {kurzHinweis && modus && <p className="text-[13px] font-semibold leading-[18px] text-[#B35300]" role="alert">{kurzHinweis}</p>}
      {modus === "korrigieren" && text === null && (
        <p className="flex items-center gap-2 text-[13px] text-[#595959]"><Loader2 className="h-4 w-4 animate-spin" /> Text im Dokument wird erkannt …</p>
      )}
    </div>
  ) : undefined;

  const formular = mitFormular ? (
    <Formular
      felder={felder}
      werte={werte}
      setWert={setWert}
      ergaenzungen={darf ? ergaenzungen : []}
      onErgText={ergText}
      onErgLoeschen={ergLoeschen}
      onKorrMarkieren={korrMarkieren}
      aktivId={aktivId}
      onFokus={fokusEintrag}
      pruefen={pruefen}
      leiste={leisteUnten ? undefined : leiste}
    />
  ) : null;

  const pdfBereich = (
    <div id="sig-pdf" className="scroll-mt-2 border-b border-[#EEEEEE] bg-[#E9E9E7] px-4 pt-4 min-[641px]:px-6 min-[1024px]:rounded-[12px] min-[1024px]:border-b-0">
      {pdfGross ? (
        <div className="h-[max(600px,calc(100dvh-260px))] overflow-hidden rounded-[6px]" aria-label="Dokument">
          <PdfAnsicht
            quelle={info.pdf_url!}
            dateiName={`${info.titel || "Dokument"}.pdf`}
            download={false}
            onEndeErreicht={endeErreicht}
            scrollWeitergeben
            onFehler={() => setGrossFehler(true)}
            className="bg-[#E9E9E7]"
            overlay={ebene}
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
                      {seitenBreite[i] && (
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
      <div className="flex items-center justify-between gap-3 pb-[20px] pt-[11px] text-[13px] leading-[18px] min-[641px]:text-[14px] min-[1024px]:pb-3">
        {gelesen ? (
          <span className="text-[#6B6B6B]">Bitte lesen Sie das Dokument vor dem Unterschreiben.</span>
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
  );

  const knopfBereich = (
    <div ref={knoepfe} className={cn("space-y-2", !nebeneinander && "px-5 pt-[15px] min-[641px]:w-full min-[641px]:pt-6", !nebeneinander && knopfSpalte)}>
      {pruefen && (offen.length > 0 || ergOffen.length > 0) && (
        <p className="text-[13px] font-semibold leading-[18px] text-[#B35300]" role="alert">
          Bitte {offen.length + ergOffen.length === 1 ? "die markierte Angabe" : `die ${offen.length + ergOffen.length} markierten Angaben`} im Formular prüfen.
        </p>
      )}
      {downloadFehler && <FehlerHinweis>{downloadFehler}</FehlerHinweis>}
      <PrimaerButton onClick={weiter} aria-disabled={!bereit} className={bereit ? "" : "bg-[#B35300]/45 hover:bg-[#B35300]/45"}>
        Weiter zur Unterschrift
      </PrimaerButton>
      {info.papier_erlaubt !== false && <SekundaerButton onClick={onPapier}>Lieber auf Papier unterschreiben</SekundaerButton>}
    </div>
  );

  return (
    <>
      <Kopf links="sicher" />
      <div className="flex flex-1 flex-col">
        <Fortschritt schritt={1} />
        <div className="px-5 pb-[11px] pt-[11px] min-[641px]:px-10 min-[641px]:pb-4 min-[641px]:pt-5">
          <h1 className={`${ueberschrift} text-[20px] leading-[25px] min-[641px]:text-[26px] min-[641px]:leading-[32px]`}>{info.titel}</h1>
          <p className="mt-0 text-[13px] leading-[17px] text-[#6B6B6B] min-[641px]:mt-1 min-[641px]:text-[14px]">{zeile}</p>
        </div>

        {nebeneinander && formular ? (
          <div className="flex items-start gap-6 px-6 pb-6">
            <div className="min-w-0 flex-1">{pdfBereich}</div>
            <aside className="sticky top-4 flex max-h-[calc(100dvh-32px)] w-[360px] shrink-0 flex-col gap-3 overflow-y-auto pb-1" aria-label="Ihre Angaben">
              {formular}
              {knopfBereich}
            </aside>
          </div>
        ) : (
          <>
            {pdfBereich}
            {formular && <div className="px-4 pt-4 min-[641px]:mx-auto min-[641px]:w-full min-[641px]:max-w-[560px]">{formular}</div>}
            {knopfBereich}
          </>
        )}
        <Fusszeile className={cn("mt-auto", leisteUnten && "pb-[220px]")} />
      </div>
      {leisteUnten && (
        // Handy/Tablet: Leiste beim Markieren unten fest, damit Dokument und „Fertig“ gleichzeitig sichtbar sind
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
          <div className="w-full max-w-[520px] rounded-[12px] border border-[#E5E5E5] bg-white p-2 shadow-[0_10px_40px_rgba(0,0,0,0.25)]">{leiste}</div>
        </div>
      )}
    </>
  );
}

/** Fängt im Modus „Korrigieren“ das Antippen eines Wortes ab und zeigt die aktuelle Markierung. */
function KorrekturFang({
  seite, scale, markiert, onTipp,
}: {
  seite: number;
  scale: number;
  markiert: SignErgaenzung | null;
  onTipp: (seite: number, p: { x: number; y: number }) => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[7] cursor-pointer"
      style={{ backgroundColor: "rgba(31,58,147,0.04)" }}
      role="button"
      aria-label="Falsches Wort antippen"
      onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onTipp(seite, { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale });
      }}
    >
      {markiert?.zeilen?.map((z, i) => (
        <span
          key={i}
          className="absolute rounded-[2px]"
          style={{
            left: (z.x - 1.5) * scale, top: (z.y - 1.5) * scale, width: (z.w + 3) * scale, height: (z.h + 3) * scale,
            backgroundColor: "rgba(31,58,147,0.16)", outline: "1.5px solid #1F3A93",
          }}
          aria-hidden
        />
      ))}
    </div>
  );
}
