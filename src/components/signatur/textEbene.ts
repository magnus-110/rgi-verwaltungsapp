/**
 * Textebene eines PDFs (pdf.js aus react-pdf) mit Koordinaten – für
 *  - „Korrigieren“ auf der Unterschriftsseite (Wort bzw. Zeile unter dem Finger erkennen) und
 *  - „Änderbare Angabe“ im Dialog „Unterschrift anfordern“ (Feld genau über einer Textzeile).
 * Koordinaten: PDF-Punkte der angezeigten Seite (Drehung/CropBox wie pdf.js-Viewport), oben links, y nach unten
 * – dieselben wie bei Feldern und placements.
 */
import type { Frei, TextZeile } from "@shared/signatur/ersetzung.ts";

export interface Wort {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  basis: number;
  groesse: number;
  /** Index des Abschnitts (zusammenhängender Text auf einer Grundlinie) */
  abschnitt: number;
}

export interface SeiteText {
  w: number;
  h: number;
  woerter: Wort[];
  /** Abschnitte = Wort-Indizes von links nach rechts */
  abschnitte: number[][];
}

let messCtx: CanvasRenderingContext2D | null | undefined;
function mass(t: string): number {
  if (messCtx === undefined) messCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!messCtx) return t.length;
  messCtx.font = "100px Helvetica, Arial, sans-serif";
  return messCtx.measureText(t).width;
}

type Teil = { text: string; x: number; x2: number; basis: number; groesse: number; endetMitLeer: boolean };

/** Text einer Seite (pdf.js PDFPageProxy) in Wörter/Abschnitte zerlegen. */
async function seiteLesen(page: any, Util: any): Promise<SeiteText> {
  const vp = page.getViewport({ scale: 1 });
  const inhalt = await page.getTextContent();
  const teile: Teil[] = [];
  for (const it of inhalt.items as any[]) {
    const str: string = it?.str ?? "";
    if (!str.trim() || !Array.isArray(it.transform)) continue;
    const t = it.transform as number[];
    const fs = Math.hypot(t[2], t[3]);
    // unsichtbare Vorlagen-Anker (1 pt) und Kleinstschrift auslassen
    if (!(fs >= 2.5) || !(it.width > 0)) continue;
    const len = Math.hypot(t[0], t[1]) || 1;
    const dx = t[0] / len, dy = t[1] / len;
    const p0 = vp.convertToViewportPoint(t[4], t[5]);
    const p1 = vp.convertToViewportPoint(t[4] + dx * it.width, t[5] + dy * it.width);
    // nur waagrechter Text (in der Ansicht)
    if (Math.abs(p1[1] - p0[1]) > 0.6 || p1[0] <= p0[0]) continue;
    const breite = p1[0] - p0[0];
    const gesamt = mass(str) || 1;
    // in Wörter zerlegen, Breiten anteilig nach Schriftbreite
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(str))) {
      const a = (mass(str.slice(0, m.index)) / gesamt) * breite;
      const b = (mass(str.slice(0, m.index + m[0].length)) / gesamt) * breite;
      teile.push({
        text: m[0], x: p0[0] + a, x2: p0[0] + b, basis: p0[1], groesse: fs,
        endetMitLeer: m.index + m[0].length < str.length,
      });
    }
    void Util;
  }
  // nach Zeile (Grundlinie) und x sortieren
  teile.sort((a, b) => (Math.abs(a.basis - b.basis) < 0.3 * Math.min(a.groesse, b.groesse) ? a.x - b.x : a.basis - b.basis));
  // Bruchstücke ohne Abstand (z. B. Zeichen einzeln gesetzt) zu Wörtern verbinden
  const woerterRoh: Teil[] = [];
  for (const t of teile) {
    const v = woerterRoh[woerterRoh.length - 1];
    if (v && !v.endetMitLeer && Math.abs(v.basis - t.basis) < 0.3 * t.groesse && t.x - v.x2 < 0.12 * t.groesse && t.x - v.x2 > -0.3 * t.groesse) {
      v.text += t.text;
      v.x2 = Math.max(v.x2, t.x2);
      v.groesse = Math.max(v.groesse, t.groesse);
      v.endetMitLeer = t.endetMitLeer;
      continue;
    }
    woerterRoh.push({ ...t });
  }
  const woerter: Wort[] = woerterRoh.map((t, i) => ({
    id: `w${i}`, text: t.text, x: t.x, w: Math.max(0.5, t.x2 - t.x),
    y: t.basis - 0.8 * t.groesse, h: t.groesse, basis: t.basis, groesse: t.groesse, abschnitt: -1,
  }));
  // Abschnitte: gleiche Grundlinie, Lücke höchstens ~2 Zeichen breit (größere Lücke = nächste Spalte)
  const abschnitte: number[][] = [];
  woerter.forEach((w, i) => {
    const a = abschnitte[abschnitte.length - 1];
    const v = a ? woerter[a[a.length - 1]] : null;
    if (v && Math.abs(v.basis - w.basis) < 0.35 * w.groesse && w.x - (v.x + v.w) < 1.6 * w.groesse) a.push(i);
    else abschnitte.push([i]);
    w.abschnitt = abschnitte.length - 1;
  });
  return { w: vp.width, h: vp.height, woerter, abschnitte };
}

const cache = new Map<string, Promise<SeiteText[]>>();

/** Text aller Seiten laden (einmal je Adresse). Fehler → leere Liste (dann gilt: keine Textebene). */
export function textLaden(url: string): Promise<SeiteText[]> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const { pdfjs } = await import("react-pdf");
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      const doc = await pdfjs.getDocument({
        url,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
      }).promise;
      const out: SeiteText[] = [];
      for (let i = 1; i <= doc.numPages; i++) out.push(await seiteLesen(await doc.getPage(i), (pdfjs as any).Util));
      return out;
    })().catch((e) => {
      console.warn("[textEbene] Text nicht lesbar:", e);
      cache.delete(url);
      return [] as SeiteText[];
    });
    cache.set(url, p);
  }
  return p;
}

/** Hat die Seite eine Textebene? */
export const hatText = (s: SeiteText | undefined) => !!s && s.woerter.length > 0;

/** Wort unter einem Punkt (mit kleiner Toleranz; sonst das nächste Wort in derselben Zeile bis 4 pt). */
export function wortBei(s: SeiteText, px: number, py: number): Wort | null {
  let best: { w: Wort; d: number } | null = null;
  for (const w of s.woerter) {
    const dx = px < w.x ? w.x - px : px > w.x + w.w ? px - (w.x + w.w) : 0;
    const dy = py < w.y ? w.y - py : py > w.y + w.h ? py - (w.y + w.h) : 0;
    const d = Math.hypot(dx, dy * 1.5);
    if (d <= 4 && (!best || d < best.d)) best = { w, d };
  }
  return best?.w ?? null;
}

/** Alle Wörter des Abschnitts (ganze Zeile bis zur nächsten Spalte). */
export const abschnittVon = (s: SeiteText, w: Wort) => s.abschnitte[w.abschnitt].map((i) => s.woerter[i]);

/** Liegt das Wort direkt neben der Auswahl (gleicher Abschnitt angrenzend, oder Nachbarzeile)? */
export function angrenzend(s: SeiteText, auswahl: Wort[], w: Wort): boolean {
  if (!auswahl.length) return false;
  const idx = (x: Wort) => s.woerter.indexOf(x);
  const ids = auswahl.map(idx);
  const i = idx(w);
  if (ids.includes(i)) return false;
  // im selben Abschnitt (gleiche Zeile bis zur nächsten Spalte): Wörter dazwischen werden mitgenommen
  if (auswahl.some((x) => x.abschnitt === w.abschnitt)) return true;
  // im Lesefluss direkt davor oder danach (auch über den Zeilenwechsel)
  const min = Math.min(...ids), max = Math.max(...ids);
  if (i === min - 1 || i === max + 1) {
    const nach = s.woerter[i === min - 1 ? min : max];
    const lz = Math.abs(nach.basis - w.basis) < 0.35 * w.groesse;
    if (lz) return true;
    // Nachbarzeile: senkrechter Abstand höchstens ~2 Zeilen
    return Math.abs(nach.basis - w.basis) < 2.6 * Math.max(w.groesse, nach.groesse);
  }
  return false;
}

/** Auswahl in Lesereihenfolge ergänzen (Wörter dazwischen werden mitgenommen). */
export function auswahlMit(s: SeiteText, auswahl: Wort[], w: Wort): Wort[] {
  const ids = [...auswahl.map((x) => s.woerter.indexOf(x)), s.woerter.indexOf(w)];
  const min = Math.min(...ids), max = Math.max(...ids);
  return s.woerter.slice(min, max + 1);
}

/** Text der Auswahl (Zeilen durch Leerzeichen verbunden). */
export const auswahlText = (woerter: Wort[]) => woerter.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();

/** Zeilen (je Grundlinie ein Kasten) der Auswahl – exakt über die Textbreite. */
export function auswahlZeilen(woerter: Wort[]): TextZeile[] {
  const zeilen: Wort[][] = [];
  for (const w of [...woerter].sort((a, b) => a.basis - b.basis || a.x - b.x)) {
    const z = zeilen[zeilen.length - 1];
    if (z && Math.abs(z[0].basis - w.basis) < 0.35 * w.groesse) z.push(w);
    else zeilen.push([w]);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return zeilen.map((z) => {
    const x = Math.min(...z.map((w) => w.x));
    const x2 = Math.max(...z.map((w) => w.x + w.w));
    const groesse = Math.max(...z.map((w) => w.groesse));
    const basis = z[0].basis;
    return { x: r(x), y: r(basis - 0.8 * groesse), w: r(x2 - x), h: r(groesse), basis: r(basis), groesse: r(groesse) };
  });
}

/**
 * Freier Platz: rechts bis zum nächsten Wort derselben Zeile (sonst Seitenrand), oben bis zur Unterkante
 * des nächsten Textes über der ersten Zeile (vom Zeilenanfang bis zum Seitenrand).
 */
export function freiBerechnen(s: SeiteText, auswahl: Wort[], zeilen: TextZeile[]): Frei {
  const ids = new Set(auswahl.map((w) => w.id));
  const letzte = zeilen[zeilen.length - 1];
  const erste = zeilen[0];
  let bis = s.w - 14;
  for (const w of s.woerter) {
    if (ids.has(w.id)) continue;
    const gleicheZeile = w.y < letzte.y + letzte.h && w.y + w.h > letzte.y;
    if (gleicheZeile && w.x >= letzte.x + letzte.w - 0.5) bis = Math.min(bis, w.x - 1.5);
  }
  let oben = 0;
  for (const w of s.woerter) {
    if (ids.has(w.id)) continue;
    const unten = w.basis + 0.22 * w.groesse; // Unterlängen
    if (unten <= erste.y + 0.5 && w.x + w.w > erste.x && w.x < s.w - 14) oben = Math.max(oben, unten);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { bis: r(Math.max(bis, letzte.x + letzte.w)), oben: r(Math.min(oben, erste.y)) };
}
