/**
 * Eigene Angaben ergänzen/korrigieren auf der Unterschriftsseite (nur wenn RGI es freigegeben hat:
 * sign-public „get“ → info.darf_ergaenzen).
 *  - Text ergänzen: Stelle im PDF antippen → Textfeld (dunkelblau), Text im großen Editor eingeben,
 *    Feld verschieben (Ziehgriff) und Größe ändern (Ecke unten rechts).
 *  - Korrigieren: Rechteck über den falschen Text ziehen (Maus) bzw. antippen (Handy, Standard-Rechteck),
 *    Stelle wird durchgestrichen; Pflicht-Eingabe „Richtig ist“ erscheint automatisch darunter.
 * Gespeichert wird erst mit der Unterschrift (sign-public „sign“), dort wird alles noch einmal geprüft.
 * Schrift/Umbruch wie im PDF (pdf.ts ergaenzungSchrift): Helvetica/Arial 10 → 6 pt, Zeile 1,2, Rand 2 pt.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type PointerEvent as RPE } from "react";
import { Check, ChevronRight, Move, MoveDiagonal2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Rechteck, SignErgaenzung } from "./api";

export const BLAU = "#1F3A93";
export const MAX_ERGAENZUNGEN = 30;
export const MAX_ZEICHEN = 300;
export const MAX_ZEILEN = 12;
const S = { gross: 10, klein: 6, zeile: 1.2, rand: 2 };
const MIN_TEXT = { w: 30, h: 12 };
const MIN_BEREICH = { w: 6, h: 6 };

export type Modus = "ergaenzen" | "korrigieren" | null;
/** Größe der angezeigten Seiten in pt (wird von der Ebene gemeldet). */
export type SeitenMasse = MutableRefObject<Record<number, { w: number; h: number }>>;
export const A4 = { w: 595.28, h: 841.89 };

// ---------------------------------------------------------------- Textumbruch wie im PDF

let ctx: CanvasRenderingContext2D | null | undefined;
function textBreite(t: string, size: number): number {
  if (ctx === undefined) ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!ctx) return t.length * size * 0.52;
  ctx.font = `${size}px Arial, Helvetica, "Liberation Sans", sans-serif`;
  return ctx.measureText(t).width;
}

function umbrechen(text: string, size: number, breite: number): string[] {
  const woerter = text.split(/\s+/).filter(Boolean);
  const zeilen: string[] = [];
  let z = "";
  for (const w of woerter) {
    const probe = z ? `${z} ${w}` : w;
    if (textBreite(probe, size) <= breite) z = probe;
    else {
      if (z) zeilen.push(z);
      let rest = w;
      while (textBreite(rest, size) > breite && rest.length > 1) {
        let n = rest.length;
        while (n > 1 && textBreite(rest.slice(0, n), size) > breite) n--;
        zeilen.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      z = rest;
    }
  }
  if (z) zeilen.push(z);
  return zeilen.length ? zeilen : [""];
}

function textZeilen(text: string, size: number, breite: number): string[] {
  const out: string[] = [];
  for (const absatz of text.split("\n")) out.push(...(absatz.trim() ? umbrechen(absatz, size, breite) : [""]));
  return out;
}

/** Größte Schrift (10 … 6 pt), bei der der Text ins Feld passt – wie im PDF. */
export function textLayout(text: string, w: number, h: number): { size: number; zeilen: string[] } {
  const breite = Math.max(4, w - 2 * S.rand);
  for (let size = S.gross; size >= S.klein; size -= 0.5) {
    const zeilen = textZeilen(text, size, breite);
    if (zeilen.length * size * S.zeile + 2 * S.rand <= h + 0.5) return { size, zeilen };
  }
  return { size: S.klein, zeilen: textZeilen(text, S.klein, breite) };
}

/** Höhe, die der Text bei 10 pt in dieser Breite braucht. */
export const textHoehe = (text: string, w: number) =>
  Math.ceil(textZeilen(text || " ", S.gross, Math.max(4, w - 2 * S.rand)).length * S.gross * S.zeile + 2 * S.rand);

/** Text wie der Server säubern (Steuerzeichen, Leerzeilen) – nur zur Anzeige der Zeichenzahl/Prüfung. */
export const textSauber = (t: string) =>
  t.replace(/\r\n?/g, "\n").split("\n").map((z) => z.replace(/[ \t ]+/g, " ").trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();

// ---------------------------------------------------------------- Anlegen / Platzieren

const klemme = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
const r1 = (n: number) => Math.round(n * 10) / 10;
const neueId = () => `e${Math.random().toString(36).slice(2, 10)}`;

/**
 * Ersatztext einer Korrektur automatisch platzieren: rechts neben dem markierten Bereich (gleiche Zeile,
 * liest sich wie „alt → neu“), wenn dort mindestens 120 pt frei sind; sonst darunter (bzw. darüber).
 */
export function ersatzPlatzieren(b: Rechteck, seite: { w: number; h: number }, h = 16): Rechteck {
  const rechts = seite.w - 6 - (b.x + b.w + 6);
  if (rechts >= 120) {
    const w = Math.min(rechts, 220);
    const y = klemme(h <= b.h + 2 ? b.y + (b.h - h) / 2 : b.y, 2, seite.h - h - 2);
    return { x: r1(b.x + b.w + 6), y: r1(y), w: r1(w), h };
  }
  const w = klemme(Math.max(b.w, 180), MIN_TEXT.w, seite.w - 8);
  const x = klemme(b.x, 4, seite.w - w - 4);
  let y = b.y + b.h + 2;
  if (y + h > seite.h - 4) y = b.y - h - 2;
  y = klemme(y, 2, seite.h - h - 2);
  return { x: r1(x), y: r1(y), w: r1(w), h };
}

export function neueErgaenzung(page: number, px: number, py: number, seite: { w: number; h: number }): SignErgaenzung {
  const w = Math.min(190, seite.w - 8);
  const h = 16;
  return {
    id: neueId(), art: "ergaenzung", page, bereich: null, text: "",
    x: r1(klemme(px, 4, seite.w - w - 4)), y: r1(klemme(py - h / 2, 2, seite.h - h - 2)), w: r1(w), h,
  };
}

export function neueKorrektur(page: number, bereich: Rechteck, seite: { w: number; h: number }): SignErgaenzung {
  const b = {
    x: r1(klemme(bereich.x, 0, seite.w - bereich.w)), y: r1(klemme(bereich.y, 0, seite.h - bereich.h)),
    w: r1(Math.min(bereich.w, seite.w)), h: r1(Math.min(bereich.h, seite.h)),
  };
  return { id: neueId(), art: "korrektur", page, bereich: b, text: "", ...ersatzPlatzieren(b, seite) };
}

/** Standard-Rechteck beim Antippen (Handy): 90 × 14 pt um die Stelle. */
export const standardBereich = (px: number, py: number): Rechteck => ({ x: px - 45, y: py - 7, w: 90, h: 14 });

// ---------------------------------------------------------------- Ebene über einer Seite

type Ziel = "text" | "bereich";

export function ErgaenzungenEbene({
  seite, scale, eigene, andere, modus, aktivId, seitenMasse, onNeu, onAendern, onWaehlen, onBearbeiten, onLoeschen,
}: {
  seite: number;
  scale: number;
  eigene: SignErgaenzung[];
  andere: SignErgaenzung[];
  modus: Modus;
  aktivId: string | null;
  seitenMasse: SeitenMasse;
  onNeu: (seite: number, art: "ergaenzung" | "korrektur", punkt: { x: number; y: number }, bereich?: Rechteck) => void;
  onAendern: (id: string, patch: Partial<SignErgaenzung>) => void;
  onWaehlen: (id: string | null) => void;
  onBearbeiten: (id: string) => void;
  onLoeschen: (id: string) => void;
}) {
  const ebene = useRef<HTMLDivElement>(null);
  // Seitengröße in pt melden (Ebene füllt die Seite aus)
  useLayoutEffect(() => {
    const el = ebene.current;
    if (!el || !scale) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) seitenMasse.current[seite] = { w: r.width / scale, h: r.height / scale };
  });
  const masse = () => seitenMasse.current[seite] ?? A4;

  // ---- Ziehen/Größe ändern (Ziehgriffe, Pointer-Capture; am Handy touch-action: none)
  const drag = useRef<{ id: string; ziel: Ziel; modus: "move" | "resize"; sx: number; sy: number; r0: Rechteck } | null>(null);
  const griffDown = (e: RPE, item: SignErgaenzung, ziel: Ziel, m: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* egal */ }
    const r0 = ziel === "bereich" && item.bereich ? item.bereich : { x: item.x, y: item.y, w: item.w, h: item.h };
    drag.current = { id: item.id, ziel, modus: m, sx: e.clientX, sy: e.clientY, r0 };
    onWaehlen(item.id);
  };
  const griffMove = (e: RPE) => {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    const { w: W, h: H } = masse();
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    const min = d.ziel === "text" ? MIN_TEXT : MIN_BEREICH;
    const r = d.modus === "move"
      ? { ...d.r0, x: klemme(d.r0.x + dx, 0, W - d.r0.w), y: klemme(d.r0.y + dy, 0, H - d.r0.h) }
      : { ...d.r0, w: klemme(d.r0.w + dx, min.w, W - d.r0.x), h: klemme(d.r0.h + dy, min.h, H - d.r0.y) };
    const rr = { x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h) };
    onAendern(d.id, d.ziel === "text" ? { ...rr, manuell: true } : { bereich: rr });
  };
  const griffUp = () => { drag.current = null; };
  const griff = (item: SignErgaenzung, ziel: Ziel, m: "move" | "resize") => ({
    onPointerDown: (e: RPE) => griffDown(e, item, ziel, m),
    onPointerMove: griffMove,
    onPointerUp: griffUp,
    onPointerCancel: griffUp,
    style: { touchAction: "none" as const },
  });

  // ---- Neue Stelle wählen (Antippen; Korrektur mit der Maus auch als Rechteck aufziehen)
  const [vorschau, setVorschau] = useState<Rechteck | null>(null);
  const auf = useRef<{ x: number; y: number; erledigt: boolean } | null>(null);
  const punkt = (e: { clientX: number; clientY: number }) => {
    const r = ebene.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const ebeneDown = (e: RPE) => {
    if (modus !== "korrigieren" || e.pointerType !== "mouse" || e.button !== 0) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* egal */ }
    auf.current = { ...punkt(e), erledigt: false };
    setVorschau(null);
  };
  const ebeneMove = (e: RPE) => {
    const a = auf.current;
    if (!a || a.erledigt) return;
    const p = punkt(e);
    setVorschau({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
  };
  const ebeneUp = (e: RPE) => {
    const a = auf.current;
    if (!a || a.erledigt) return;
    a.erledigt = true;
    const p = punkt(e);
    const b = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) };
    setVorschau(null);
    onNeu(seite, "korrektur", p, b.w >= MIN_BEREICH.w && b.h >= MIN_BEREICH.h ? b : standardBereich(a.x, a.y));
  };
  const ebeneClick = (e: React.MouseEvent) => {
    if (auf.current?.erledigt) {
      auf.current = null;
      return;
    }
    const p = punkt(e);
    if (modus === "ergaenzen") onNeu(seite, "ergaenzung", p);
    else if (modus === "korrigieren") onNeu(seite, "korrektur", p, standardBereich(p.x, p.y));
  };

  const meine = eigene.filter((x) => x.page === seite);
  const fremde = andere.filter((x) => x.page === seite);

  return (
    <div ref={ebene} className="absolute inset-0">
      {fremde.map((x) => <Darstellung key={x.id} e={x} scale={scale} />)}
      {meine.map((x) => {
        const aktiv = aktivId === x.id;
        const box = { left: x.x * scale, top: x.y * scale, width: x.w * scale, height: x.h * scale };
        const b = x.bereich;
        // Werkzeugleiste über Textfeld und Markierung (sonst darunter), rechts neben dem Markierungs-Griff
        const oben = b ? Math.min(box.top, b.y * scale) : box.top;
        const unten = b ? Math.max(box.top + box.height, (b.y + b.h) * scale) : box.top + box.height;
        const links = (b ? Math.min(box.left, b.x * scale) : box.left) + (b ? 20 : 0);
        return (
          <div key={x.id}>
            <Darstellung e={x} scale={scale} eigen aktiv={aktiv} onTipp={() => (aktiv ? onBearbeiten(x.id) : onWaehlen(x.id))} />
            {aktiv && (
              <>
                {/* Werkzeugleiste über dem Textfeld (unter dem Feld, wenn oben kein Platz ist) */}
                <div
                  className="pointer-events-auto absolute z-[8] flex items-center gap-0.5 rounded-full border border-[#E5E5E5] bg-white p-0.5 shadow-[0_2px_10px_rgba(0,0,0,0.18)]"
                  style={{ left: Math.max(0, links), top: oben >= 48 ? oben - 46 : unten + 8 }}
                >
                  <button type="button" aria-label="Verschieben (ziehen)" title="Verschieben (ziehen)" className="flex h-9 w-9 cursor-grab items-center justify-center rounded-full text-[#1F3A93] hover:bg-[#EEF1FA] active:cursor-grabbing" {...griff(x, "text", "move")}>
                    <Move className="h-[18px] w-[18px]" />
                  </button>
                  <button type="button" aria-label="Text bearbeiten" title="Text bearbeiten" onClick={() => onBearbeiten(x.id)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#2B2B2B] hover:bg-[#FAFAFA]">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Löschen" title="Löschen" onClick={() => onLoeschen(x.id)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#B42318] hover:bg-[#FEF3F2]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Auswahl beenden" title="Fertig" onClick={() => onWaehlen(null)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#1E6B34] hover:bg-[#F0F7F2]">
                    <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
                  </button>
                </div>
                <Eckgriff left={box.left + box.width} top={box.top + box.height} label="Größe ändern" {...griff(x, "text", "resize")} />
                {b && (
                  <>
                    <Eckgriff left={b.x * scale} top={b.y * scale} label="Markierung verschieben" verschieben {...griff(x, "bereich", "move")} />
                    <Eckgriff left={(b.x + b.w) * scale} top={(b.y + b.h) * scale} label="Markierung anpassen" {...griff(x, "bereich", "resize")} />
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
      {modus && (
        <div
          className={cn("pointer-events-auto absolute inset-0 z-[7]", modus === "korrigieren" ? "cursor-crosshair" : "cursor-text")}
          style={{ backgroundColor: "rgba(31,58,147,0.04)" }}
          onPointerDown={ebeneDown}
          onPointerMove={ebeneMove}
          onPointerUp={ebeneUp}
          onClick={ebeneClick}
          aria-label={modus === "korrigieren" ? "Falsche Stelle markieren" : "Stelle für die Ergänzung wählen"}
          role="button"
        >
          {vorschau && (
            <div
              className="absolute border border-dashed"
              style={{ left: vorschau.x * scale, top: vorschau.y * scale, width: vorschau.w * scale, height: vorschau.h * scale, borderColor: BLAU, backgroundColor: "rgba(31,58,147,0.08)" }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Runder Griff (Ecke): Größe ändern bzw. Markierung verschieben – Trefferfläche 32 px. */
function Eckgriff({
  left, top, label, verschieben, style, ...p
}: {
  left: number;
  top: number;
  label: string;
  verschieben?: boolean;
  style?: React.CSSProperties;
  onPointerDown: (e: RPE) => void;
  onPointerMove: (e: RPE) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("pointer-events-auto absolute z-[8] flex h-8 w-8 items-center justify-center", verschieben ? "cursor-move" : "cursor-nwse-resize")}
      style={{ ...style, left: left - 16, top: top - 16 }}
      {...p}
    >
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]" style={{ backgroundColor: BLAU }}>
        {verschieben ? <Move className="h-2.5 w-2.5" /> : <MoveDiagonal2 className="h-2.5 w-2.5" />}
      </span>
    </button>
  );
}

/** Darstellung einer Ergänzung (wie im PDF): Durchstreichung + blauer Text auf leicht deckendem Weiß. */
function Darstellung({ e, scale, eigen, aktiv, onTipp }: { e: SignErgaenzung; scale: number; eigen?: boolean; aktiv?: boolean; onTipp?: () => void }) {
  const b = e.bereich;
  const { size, zeilen } = textLayout(e.text, e.w, e.h);
  const leer = !e.text.trim();
  const n = b ? Math.max(1, Math.round(b.h / 13)) : 0;
  return (
    <>
      {b && (
        <div
          className="absolute"
          style={{
            left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale,
            outline: aktiv ? `1.5px dashed ${BLAU}` : undefined, outlineOffset: 1,
            backgroundColor: aktiv ? "rgba(31,58,147,0.06)" : undefined,
          }}
          aria-hidden
        >
          {Array.from({ length: n }, (_, i) => (
            <span
              key={i}
              className="absolute left-0 right-0"
              style={{ top: ((i + 0.5) * b.h / n) * scale - Math.max(1, 0.9 * scale) / 2, height: Math.max(1, 0.9 * scale), backgroundColor: BLAU, opacity: 0.9 }}
            />
          ))}
        </div>
      )}
      <div
        role={eigen ? "button" : undefined}
        tabIndex={eigen ? 0 : undefined}
        aria-label={eigen ? `${e.art === "korrektur" ? "Korrektur" : "Ergänzung"}: ${e.text || "noch ohne Text"}` : undefined}
        onClick={eigen ? (ev) => { ev.stopPropagation(); onTipp?.(); } : undefined}
        onKeyDown={eigen ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onTipp?.(); } } : undefined}
        className={cn("absolute overflow-visible font-sans", eigen && "pointer-events-auto cursor-pointer")}
        style={{
          left: e.x * scale, top: e.y * scale, width: e.w * scale, minHeight: e.h * scale, height: e.h * scale,
          backgroundColor: "rgba(255,255,255,0.8)",
          outline: eigen ? (aktiv ? `1.5px dashed ${BLAU}` : leer ? "1.5px dashed #ee7202" : "1px dotted rgba(31,58,147,0.55)") : undefined,
          outlineOffset: 1,
          padding: S.rand * scale,
          fontFamily: 'Arial, Helvetica, "Liberation Sans", sans-serif',
          fontSize: size * scale,
          lineHeight: `${size * S.zeile * scale}px`,
          color: BLAU,
          whiteSpace: "pre",
          zIndex: aktiv ? 6 : 4,
        }}
      >
        {leer ? (
          <span className="italic" style={{ color: "#B35300", fontSize: Math.max(9, 9 * scale) }}>
            {e.art === "korrektur" ? "Richtig ist …" : "Text eingeben"}
          </span>
        ) : (
          zeilen.map((z, i) => <div key={i}>{z || " "}</div>)
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Werkzeugleiste, Editor, Liste

/** Knöpfe „Text ergänzen“ / „Korrigieren“ bzw. Hinweis, solange eine Stelle gewählt wird. */
export function ErgaenzenLeiste({
  modus, setModus, anzahl, gross, korrArt, setKorrArt, markiert, onMarkierFertig, scan,
}: {
  modus: Modus;
  setModus: (m: Modus) => void;
  anzahl: number;
  gross: boolean;
  /** Korrigieren: ein Wort oder die ganze Zeile markieren */
  korrArt?: "wort" | "zeile";
  setKorrArt?: (a: "wort" | "zeile") => void;
  /** gerade markierter Text (Korrektur) */
  markiert?: string | null;
  onMarkierFertig?: () => void;
  /** Dokument ohne Textebene (Scan): Rechteck markieren */
  scan?: boolean;
}) {
  const voll = anzahl >= MAX_ERGAENZUNGEN;
  const tippen = gross ? "Klicken" : "Tippen";
  if (modus) {
    return (
      <div className="space-y-2 rounded-[10px] border border-[#C9D3EE] bg-[#EEF1FA] px-3 py-2.5" role="status">
        {modus === "korrigieren" && !scan && setKorrArt && (
          <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-white p-1" role="radiogroup" aria-label="Was markieren?">
            {(["wort", "zeile"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={korrArt === a}
                onClick={() => setKorrArt(a)}
                className={cn("h-[38px] rounded-[8px] text-[14px] font-semibold", korrArt === a ? "bg-[#1F3A93] text-white" : "text-[#1F3A93] hover:bg-[#F7F8FC]")}
              >
                {a === "wort" ? "Wort" : "Ganze Zeile"}
              </button>
            ))}
          </div>
        )}
        <p className="text-[13.5px] leading-[18px] text-[#1F3A93]">
          {modus === "ergaenzen"
            ? `${tippen} Sie im Dokument auf die Stelle, an der Sie Text ergänzen möchten.`
            : markiert
              ? <>Markiert: „<b className="font-semibold">{markiert}</b>“. {tippen} Sie auf ein angrenzendes Wort, um die Markierung zu erweitern.</>
              : scan
                ? gross
                  ? "Dieses Dokument hat keinen erkennbaren Text. Ziehen Sie ein Rechteck über die falsche Stelle (oder klicken Sie darauf)."
                  : "Dieses Dokument hat keinen erkennbaren Text. Tippen Sie auf die falsche Stelle."
                : `${tippen} Sie im Dokument auf ${korrArt === "zeile" ? "die falsche Zeile" : "das falsche Wort"}.`}
        </p>
        <div className="flex gap-2">
          {markiert && onMarkierFertig && (
            <button type="button" onClick={onMarkierFertig} className="h-[44px] flex-1 rounded-[10px] bg-[#1F3A93] px-3.5 text-[14.5px] font-semibold text-white hover:bg-[#182F78]">
              Fertig – richtigen Text eingeben
            </button>
          )}
          <button type="button" onClick={() => setModus(null)} className={cn("h-[44px] shrink-0 rounded-[10px] border border-[#D6D6D6] bg-white px-3.5 text-[14px] font-semibold text-[#2B2B2B] hover:bg-[#FAFAFA]", !markiert && "ml-auto")}>
            {markiert ? "Abbrechen" : "Abbrechen"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1.5 text-[13px] leading-[18px] text-[#595959]">
        Stimmt etwas nicht oder fehlt eine Angabe? Sie können das Dokument selbst korrigieren oder ergänzen.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {([
          ["korrigieren", "Korrigieren", <span key="i" className="text-[15px] font-semibold leading-none line-through decoration-2">Ab</span>],
          ["ergaenzen", "Text ergänzen", <Pencil key="i" className="h-4 w-4" />],
        ] as const).map(([m, text, icon]) => (
          <button
            key={m}
            type="button"
            disabled={voll}
            onClick={() => setModus(m)}
            className="flex h-[44px] items-center justify-center gap-2 rounded-[10px] border border-[#D6D6D6] bg-white px-3 text-[14.5px] font-semibold text-[#1F3A93] hover:bg-[#F7F8FC] disabled:opacity-45"
          >
            {icon}
            {text}
          </button>
        ))}
      </div>
      {voll && <p className="mt-1 text-[12px] text-[#6B6B6B]">Höchstens {MAX_ERGAENZUNGEN} Ergänzungen je Dokument.</p>}
    </div>
  );
}

/** Großer Eingabe-Editor (unten fest, gut mit dem Daumen erreichbar) für Ergänzung bzw. „Richtig ist“. */
export function ErgaenzungEditor({
  e, onText, onFertig, onLoeschen,
}: {
  e: SignErgaenzung;
  onText: (t: string) => void;
  onFertig: () => void;
  onLoeschen: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => ref.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [e.id]);
  const korrektur = e.art === "korrektur";
  const sauber = textSauber(e.text);
  const zuVieleZeilen = sauber.split("\n").length > MAX_ZEILEN;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]" role="dialog" aria-label={korrektur ? "Korrektur" : "Text ergänzen"}>
      <div className="w-full max-w-[520px] rounded-[12px] border border-[#E5E5E5] bg-white p-4 shadow-[0_10px_40px_rgba(0,0,0,0.25)]">
        <label htmlFor="sig-erg-eingabe" className="block text-[15px] font-semibold leading-[20px] text-[#2B2B2B]">
          {korrektur ? <>Richtig ist:<span className="text-[#B35300]"> *</span></> : "Ihre Ergänzung"}
        </label>
        <p className="mt-0.5 text-[12.5px] leading-[17px] text-[#6B6B6B]">
          {korrektur
            ? "Die markierte Stelle wird durchgestrichen. Ihr Text erscheint daneben in Blau – Sie können ihn verschieben."
            : `Ihr Text erscheint auf Seite ${e.page + 1} an der gewählten Stelle in Blau.`}
        </p>
        <form
          className="mt-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            onFertig();
          }}
        >
          <textarea
            ref={ref}
            id="sig-erg-eingabe"
            value={e.text}
            maxLength={MAX_ZEICHEN}
            rows={4}
            onChange={(ev) => onText(ev.target.value)}
            placeholder={korrektur ? "z. B. richtige IBAN, Anschrift oder Name" : "Text eingeben"}
            className="block min-h-[104px] w-full resize-none rounded-[8px] border border-[#CCCCCC] bg-white px-3 py-2.5 text-[16px] leading-[22px] text-[#1F3A93] outline-none placeholder:text-[#9A9A9A] focus:border-[#B35300] focus:ring-2 focus:ring-[#B35300]/20"
          />
          <div className="mt-1 flex items-center justify-between text-[12px] text-[#6B6B6B]">
            <span className={zuVieleZeilen ? "font-semibold text-[#B35300]" : undefined}>
              {zuVieleZeilen ? `Höchstens ${MAX_ZEILEN} Zeilen.` : !sauber ? (korrektur ? "Ohne Text wird die Korrektur verworfen." : "Ohne Text wird die Ergänzung verworfen.") : " "}
            </span>
            <span className="tabular-nums">{e.text.length} / {MAX_ZEICHEN}</span>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button type="button" onClick={onLoeschen} className="flex h-[44px] items-center gap-1.5 rounded-[10px] border border-[#D6D6D6] bg-white px-3.5 text-[14px] font-semibold text-[#B42318] hover:bg-[#FEF3F2]">
              <Trash2 className="h-4 w-4" /> Löschen
            </button>
            <button type="submit" className="h-[44px] flex-1 rounded-[10px] bg-[#B35300] px-5 text-[15px] font-semibold text-white hover:bg-[#9A4700]">
              Fertig
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Kurztext einer Ergänzung für Listen. */
export const ergaenzungKurz = (e: SignErgaenzung) => {
  const t = textSauber(e.text).replace(/\s*\n\s*/g, " / ");
  if (!t) return e.art === "korrektur" ? "Korrektur – „Richtig ist“ fehlt noch" : "Ergänzung – Text fehlt noch";
  if (e.art === "korrektur" && e.original_text) return `Statt „${e.original_text}“: ${t}`;
  return e.art === "korrektur" ? `Korrektur: ersetzt durch „${t}“` : `Ergänzung: „${t}“`;
};

/** Liste „Ihre Ergänzungen (n)“ mit Sprung, Bearbeiten und Löschen. */
export function ErgaenzungenListe({
  liste, aktivId, onSprung, onBearbeiten, onLoeschen,
}: {
  liste: SignErgaenzung[];
  aktivId: string | null;
  onSprung: (e: SignErgaenzung) => void;
  onBearbeiten: (e: SignErgaenzung) => void;
  onLoeschen: (e: SignErgaenzung) => void;
}) {
  if (!liste.length) return null;
  return (
    <div className="rounded-[10px] border border-[#E5E5E5] bg-white px-3 py-2.5">
      <div className="text-[14px] font-semibold leading-[18px] text-[#2B2B2B]">Ihre Ergänzungen ({liste.length})</div>
      <ul className="mt-1.5 space-y-1">
        {liste.map((e) => {
          const leer = !textSauber(e.text);
          return (
            <li key={e.id} className={cn("flex items-center gap-1 rounded-[8px] pr-1", aktivId === e.id ? "bg-[#EEF1FA]" : "bg-[#FAFAFA]")}>
              <button type="button" onClick={() => onSprung(e)} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-[14px] leading-[18px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: leer ? "#ee7202" : BLAU }} aria-hidden />
                <span className={cn("min-w-0 flex-1 break-words", leer ? "text-[#B35300]" : "text-[#1F3A93]")}>{ergaenzungKurz(e)}</span>
                <span className="shrink-0 text-[12.5px] text-[#6B6B6B]">Seite {e.page + 1}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#B35300]" />
              </button>
              <button type="button" onClick={() => onBearbeiten(e)} aria-label="Bearbeiten" title="Bearbeiten" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] text-[#2B2B2B] hover:bg-white">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => onLoeschen(e)} aria-label="Löschen" title="Löschen" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] text-[#B42318] hover:bg-white">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
