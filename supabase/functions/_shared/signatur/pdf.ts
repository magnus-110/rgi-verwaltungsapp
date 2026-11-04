// Elektronische Unterschrift – alles rund ums PDF (pdf-lib):
//  - Unterschriften an den Platzierungen stempeln (Koordinaten wie src/lib/pdfSign.ts:
//    PDF-Punkte, Ursprung oben links in der Ansicht; Drehung und CropBox werden beachtet)
//  - Fußzeile „Elektronisch unterschrieben über RGI Immobilien · SIG-… · Datum“
//  - Papier-Rücksendungen (Fotos/PDFs) zu einem PDF zusammenfügen
//  - Prüfblatt (Mockup v06/v07) als Anlage oder eigenes Nachweis-PDF
import {
  PDFArray,
  PDFDocument,
  PDFName,
  StandardFonts,
  concatTransformationMatrix,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import { FIRMA_ZEILE, Fehler, LOGO_URL, base64ZuBytes, datum, datumZeit, geraet } from "./basis.ts";
import { UNTERSCHRIFT, unterschriftZuschneiden } from "./bild.ts";
import { ersetzungenSortieren, fussnotenText, helvSicher, seiteLayout, type Ersetzung, type Frei, type TextZeile } from "./ersetzung.ts";

// Logo (728×274) einmal je Instanz von der öffentlichen Logo-Adresse laden; ohne Netz geht es ohne Logo weiter.
let logoBytes: Uint8Array | null | undefined;
async function logoLaden(): Promise<Uint8Array | null> {
  if (logoBytes !== undefined) return logoBytes;
  try {
    const r = await fetch(LOGO_URL);
    logoBytes = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch {
    logoBytes = null;
  }
  return logoBytes;
}

// deno-lint-ignore no-explicit-any
type Doc = any;
// deno-lint-ignore no-explicit-any
type Page = any;
// deno-lint-ignore no-explicit-any
type Font = any;

const A4: [number, number] = [595.28, 841.89];

const farbe = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const F = {
  orange: farbe("#F08C1F"),
  akzent: farbe("#B35300"),
  text: farbe("#2B2B2B"),
  text2: farbe("#595959"),
  grau: farbe("#6B6B6B"),
  hell: farbe("#8A8A8A"),
  creme: farbe("#F7F7F7"),
  orangeHell: farbe("#FFF7ED"),
  rand: farbe("#E5E5E5"),
  box: farbe("#EFEFEF"),
  tinte: rgb(0.04, 0.04, 0.12),
  // Ergänzungen/Korrekturen der Unterzeichner
  blau: farbe("#1F3A93"),
};

export interface Platzierung {
  page: number; // 0-basiert
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Unterzeichner-Daten, wie sie fürs PDF gebraucht werden (Auszug aus sign_request_signers). */
export interface SignerPdf {
  id: string;
  name: string;
  rolle?: string | null;
  rolle_key?: string | null;
  email?: string | null;
  methode: string;
  status: string;
  typed_name?: string | null;
  signature_png?: string | null;
  signed_at?: string | null;
  placements?: Platzierung[] | null;
  ort_datum?: boolean;
  ort?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  copy_sent_at?: string | null;
  paper_eingang?: string | null;
  paper_eingang_at?: string | null;
  paper_page_count?: number | null;
  paper_pruefung?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------- Hilfen

/** Größe der angezeigten Seiten (pt, Drehung und CropBox beachtet) – für die Prüfung von Ergänzungen. */
export async function seitenMasse(bytes: Uint8Array): Promise<{ w: number; h: number }[]> {
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return d.getPages().map((p: Page) => ansichtsGroesse(p));
}

export async function seitenZaehlen(bytes: Uint8Array): Promise<number> {
  try {
    const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return d.getPageCount();
  } catch {
    throw new Fehler(400, "Die Datei ist kein lesbares PDF.");
  }
}

export const istPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
export const istJpg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
export const istPng = (b: Uint8Array) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
export function istHeic(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const ftyp = String.fromCharCode(b[4], b[5], b[6], b[7]);
  const marke = String.fromCharCode(b[8], b[9], b[10], b[11]);
  return ftyp === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(marke);
}

/** Text auf Zeichen beschränken, die die Standardschrift (WinAnsi) darstellen kann. */
export function sicher(font: Font, text: string): string {
  let out = "";
  for (const ch of String(text ?? "").replace(/[\r\n\t]+/g, " ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += ch === "\u2009" || ch === "\u202f" ? " " : "?";
    }
  }
  return out;
}

function umbrechen(font: Font, text: string, size: number, breite: number): string[] {
  const woerter = sicher(font, text).split(/\s+/).filter(Boolean);
  const zeilen: string[] = [];
  let z = "";
  for (const w of woerter) {
    const probe = z ? `${z} ${w}` : w;
    if (font.widthOfTextAtSize(probe, size) <= breite) z = probe;
    else {
      if (z) zeilen.push(z);
      // überlanges Wort hart trennen
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > breite && rest.length > 1) {
        let n = rest.length;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > breite) n--;
        zeilen.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      z = rest;
    }
  }
  if (z) zeilen.push(z);
  return zeilen.length ? zeilen : [""];
}

/** Matrix Ansicht (oben links, y nach unten) → PDF-Seite, wie viewToPdfMatrix in src/lib/pdfSign.ts. */
function viewToPdfMatrix(rotation: number, box: { x: number; y: number; width: number; height: number }) {
  const r = ((rotation % 360) + 360) % 360;
  const { x: cx, y: cy, width: cw, height: ch } = box;
  switch (r) {
    case 90:
      return [0, 1, 1, 0, cx, cy];
    case 180:
      return [-1, 0, 0, 1, cx + cw, cy];
    case 270:
      return [0, -1, -1, 0, cx + cw, cy + ch];
    default:
      return [1, 0, 0, -1, cx, cy + ch];
  }
}

function ansichtsGroesse(page: Page): { w: number; h: number } {
  const c = page.getCropBox();
  const r = ((page.getRotation().angle % 360) + 360) % 360;
  return r === 90 || r === 270 ? { w: c.height, h: c.width } : { w: c.width, h: c.height };
}

/** Klammert den vorhandenen Seiteninhalt einmalig in q … Q (wie pdfSign.ts). */
function inhaltEinklammern(doc: Doc, page: Page) {
  try {
    const contents = page.node.get(PDFName.of("Contents"));
    if (!contents) return;
    const q = doc.context.register(doc.context.contentStream(pushGraphicsState()));
    const Q = doc.context.register(doc.context.contentStream(popGraphicsState()));
    const arr = PDFArray.withContext(doc.context);
    arr.push(q);
    const resolved = doc.context.lookup(contents);
    if (resolved instanceof PDFArray) for (let i = 0; i < resolved.size(); i++) arr.push(resolved.get(i));
    else arr.push(contents);
    arr.push(Q);
    page.node.set(PDFName.of("Contents"), arr);
  } catch {
    // im Zweifel ohne Klammer weiter
  }
}

/**
 * Zeichnet in einem Rechteck der Ansicht (oben links) – innerhalb von `zeichne` gilt:
 * Ursprung links unten im Rechteck, y nach oben, Einheit PDF-Punkte.
 */
function imRechteck(page: Page, r: { x: number; y: number; w: number; h: number }, zeichne: () => void) {
  const m = viewToPdfMatrix(page.getRotation().angle, page.getCropBox());
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(...(m as [number, number, number, number, number, number])),
    concatTransformationMatrix(1, 0, 0, -1, r.x, r.y + r.h),
  );
  zeichne();
  page.pushOperators(popGraphicsState());
}

async function fonts(doc: Doc) {
  return {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    fett: await doc.embedFont(StandardFonts.HelveticaBold),
    kursiv: await doc.embedFont(StandardFonts.TimesRomanItalic),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
}

// ---------------------------------------------------------------- Stempeln

export interface StempelOptionen {
  nummer: string;
  /** Ort für interne Unterschriften, falls beim Unterzeichner keiner gespeichert ist */
  standardOrt?: string;
  /** Ausfüllfelder (sign_request_fields): Werte fest einsetzen, Vorlagen-Anker überdecken */
  felder?: FeldPdf[];
  /** Ergänzungen/Korrekturen der Unterzeichner (sign_request_ergaenzungen): dunkelblau einsetzen */
  ergaenzungen?: ErgaenzungPdf[];
}

/** Ergänzung/Korrektur fürs PDF (Auszug aus sign_request_ergaenzungen). */
export interface ErgaenzungPdf {
  art: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  bereich?: { x: number; y: number; w: number; h: number } | null;
  text: string;
  erstellt_von?: string;
  erstellt_am?: string;
  /** Korrektur per Antippen: Originaltext und seine Zeilen (exakt durchgestrichen) */
  original_text?: string | null;
  zeilen?: TextZeile[] | null;
  frei?: Frei | null;
}

/** Schrift der Ergänzungen (Helvetica): 10 pt, bei Platzmangel kleiner bis 6 pt; Zeilenabstand 1,2; Innenrand 2 pt. */
export const ERG_SCHRIFT = { gross: 10, klein: 6, zeile: 1.2, rand: 2 };

/** Zeilen einer Ergänzung (Umbrüche des Unterzeichners bleiben, lange Zeilen werden umbrochen). */
export function ergaenzungZeilen(font: Font, text: string, size: number, breite: number): string[] {
  const out: string[] = [];
  for (const absatz of String(text ?? "").split("\n")) {
    if (!absatz.trim()) out.push("");
    else out.push(...umbrechen(font, absatz, size, breite));
  }
  return out;
}

/** Größte Schrift (10 … 6 pt), bei der der Text ins Feld passt. */
export function ergaenzungSchrift(font: Font, text: string, w: number, h: number): { size: number; zeilen: string[] } {
  const S = ERG_SCHRIFT;
  const breite = Math.max(4, w - 2 * S.rand);
  for (let size = S.gross; size >= S.klein; size -= 0.5) {
    const zeilen = ergaenzungZeilen(font, text, size, breite);
    if (zeilen.length * size * S.zeile + 2 * S.rand <= h + 0.5) return { size, zeilen };
  }
  return { size: S.klein, zeilen: ergaenzungZeilen(font, text, S.klein, breite) };
}

/**
 * Ergänzungen dunkelblau einsetzen: Korrekturbereich dünn durchgestrichen (Original bleibt lesbar),
 * Text (Ergänzung bzw. „Richtig ist“) auf leicht deckendem Weiß, damit er gut lesbar ist.
 */
function ergaenzungenZeichnen(pages: Page[], liste: ErgaenzungPdf[], font: Font, klammern: (idx: number) => void) {
  // Korrekturen per Antippen (mit zeilen) zeichnet ersetzungenZeichnen
  for (const e of liste.filter((x) => !(x.art === "korrektur" && Array.isArray(x.zeilen) && x.zeilen.length))) {
    const page = pages[e.page];
    if (!page || !(e.w > 0) || !(e.h > 0)) continue;
    klammern(e.page);
    const b = e.bereich;
    if (e.art === "korrektur" && b && b.w > 0 && b.h > 0) {
      // eine Linie je ~13 pt Höhe (mehrzeilige Bereiche: jede Zeile durchgestrichen)
      const n = Math.max(1, Math.round(b.h / 13));
      imRechteck(page, b, () => {
        for (let i = 0; i < n; i++) {
          const y = b.h - (i + 0.5) * (b.h / n);
          page.drawLine({ start: { x: 0, y }, end: { x: b.w, y }, thickness: 0.9, color: F.blau, opacity: 0.9 });
        }
      });
    }
    const { size, zeilen } = ergaenzungSchrift(font, e.text, e.w, e.h);
    const S = ERG_SCHRIFT;
    imRechteck(page, e, () => {
      const textH = zeilen.length * size * S.zeile + 2 * S.rand;
      const hoehe = Math.max(e.h, textH);
      page.drawRectangle({ x: 0, y: e.h - hoehe, width: e.w, height: hoehe, color: rgb(1, 1, 1), opacity: 0.8 });
      zeilen.forEach((z, i) => {
        if (!z) return;
        page.drawText(z, { x: S.rand, y: e.h - S.rand - size * 0.95 - i * size * S.zeile, size, font, color: F.blau });
      });
    });
  }
}

/**
 * Ersetzungen zeichnen (geänderte vorbelegte Angaben + Korrekturen per Antippen), Lage aus ersetzung.ts –
 * dieselbe Berechnung wie die Vorschau auf der Unterschriftsseite. Alter Text exakt durchgestrichen,
 * neuer Text dunkelblau dahinter/darüber bzw. als Fußnote unten auf der Seite.
 */
function ersetzungenZeichnen(pages: Page[], liste: Ersetzung[], font: Font, klammern: (idx: number) => void) {
  const proSeite = new Map<number, Ersetzung[]>();
  for (const e of ersetzungenSortieren(liste)) {
    if (!pages[e.page] || !e.zeilen.length || !e.neu.trim()) continue;
    proSeite.set(e.page, [...(proSeite.get(e.page) ?? []), e]);
  }
  for (const [idx, l] of proSeite) {
    const page = pages[idx];
    klammern(idx);
    const v = ansichtsGroesse(page);
    const { layouts, fussnoten } = seiteLayout(l, v);
    // ganze Seite als Rechteck: innen y nach oben → yl = v.h − y
    imRechteck(page, { x: 0, y: 0, w: v.w, h: v.h }, () => {
      const Y = (y: number) => v.h - y;
      for (const lay of layouts) {
        for (const st of lay.striche) {
          page.drawLine({ start: { x: st.x1, y: Y(st.y) }, end: { x: st.x2, y: Y(st.y) }, thickness: st.dicke, color: F.blau });
        }
        if (lay.text) {
          const t = lay.text;
          if (t.hintergrund) {
            page.drawRectangle({ x: t.x - 1, y: Y(lay.kasten.y + lay.kasten.h) - 1, width: lay.kasten.w + 2, height: lay.kasten.h + 2, color: rgb(1, 1, 1), opacity: 0.85 });
          }
          page.drawText(helvSicher(t.inhalt), { x: t.x, y: Y(t.basis), size: t.size, font, color: F.blau });
        }
        if (lay.marke) nummerKreis(page, font, lay.marke.x, Y(lay.marke.y), lay.marke.r, lay.marke.nr);
      }
      for (const fn of fussnoten) {
        page.drawRectangle({ x: fn.kasten.x, y: Y(fn.kasten.y + fn.kasten.h), width: fn.kasten.w, height: fn.kasten.h, color: rgb(1, 1, 1), opacity: 0.9 });
        nummerKreis(page, font, fn.marke.x, Y(fn.marke.y), fn.marke.r, fn.nr);
        for (const z of fn.zeilen) page.drawText(helvSicher(z.inhalt), { x: z.x, y: Y(z.basis), size: fn.size, font, color: F.blau });
      }
    });
  }
}

/** Kreis mit Ziffer (Fußnote ①), Mittelpunkt cx/cy (y nach oben). */
function nummerKreis(page: Page, font: Font, cx: number, cy: number, r: number, nr: number) {
  page.drawCircle({ x: cx, y: cy, size: r, borderColor: F.blau, borderWidth: Math.max(0.45, r * 0.14) });
  const t = String(nr);
  const size = r * (t.length > 1 ? 1.15 : 1.45);
  page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y: cy - size * 0.36, size, font, color: F.blau });
}

/** Ersetzungen aus Feldern (vorbelegt, geändert) und Korrekturen per Antippen. */
export function ersetzungenAus(felder: FeldPdf[], ergaenzungen: ErgaenzungPdf[]): Ersetzung[] {
  const out: Ersetzung[] = [];
  for (const f of felder) {
    if (f.typ !== "vorbelegt" || !f.wert || !Array.isArray(f.text_zeilen) || !f.text_zeilen.length) continue;
    out.push({ page: f.page, zeilen: f.text_zeilen, frei: f.frei ?? { bis: 0, oben: 0 }, alt: f.ausgangswert ?? "", neu: f.wert, label: f.beschriftung || "Angabe" });
  }
  for (const e of ergaenzungen) {
    if (e.art !== "korrektur" || !Array.isArray(e.zeilen) || !e.zeilen.length) continue;
    out.push({ page: e.page, zeilen: e.zeilen, frei: e.frei ?? { bis: 0, oben: 0 }, alt: e.original_text ?? "", neu: e.text });
  }
  return out;
}

/** Ausfüllfeld fürs PDF (Auszug aus sign_request_fields). */
export interface FeldPdf {
  typ: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  wert: string | null;
  beschriftung?: string;
  gruppe?: string | null;
  wert_gesetzt_von?: string | null;
  wert_gesetzt_am?: string | null;
  ausfueller?: string;
  anker?: { page: number; x: number; y: number; w: number; h: number } | null;
  /** nur vorbelegt */
  ausgangswert?: string | null;
  text_zeilen?: TextZeile[] | null;
  frei?: Frei | null;
}

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Werte der Ausfüllfelder einsetzen: Kreuz im Kästchen, Datum TT.MM.JJJJ, Text – Größe passend zum Feld. */
function felderZeichnen(pages: Page[], felder: FeldPdf[], font: Font, klammern: (idx: number) => void) {
  for (const f of felder) {
    // Unsichtbare Vorlagen-Anker weiß überdecken
    if (f.anker && pages[f.anker.page]) {
      klammern(f.anker.page);
      const a = f.anker;
      imRechteck(pages[a.page], a, () => {
        pages[a.page].drawRectangle({ x: 0, y: 0, width: a.w, height: a.h, color: rgb(1, 1, 1) });
      });
    }
    const page = pages[f.page];
    // vorbelegte Angaben: zeichnet ersetzungenZeichnen (nur wenn geändert)
    if (f.typ === "vorbelegt") continue;
    if (!page || !f.wert || !(f.w > 0) || !(f.h > 0)) continue;
    klammern(f.page);
    if (f.typ === "ankreuz" || f.typ === "auswahl") {
      if (f.wert !== "ja") continue;
      // Kreuz „✕“ aus zwei Strichen (unabhängig von Schriften), mittig im Kästchen
      const s = Math.min(f.w, f.h);
      const rand = s * 0.16;
      const dicke = Math.max(0.9, s * 0.12);
      imRechteck(page, f, () => {
        const x0 = (f.w - s) / 2 + rand, y0 = (f.h - s) / 2 + rand, x1 = (f.w + s) / 2 - rand, y1 = (f.h + s) / 2 - rand;
        page.drawLine({ start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, thickness: dicke, color: F.tinte });
        page.drawLine({ start: { x: x0, y: y1 }, end: { x: x1, y: y0 }, thickness: dicke, color: F.tinte });
      });
      continue;
    }
    const roh = f.typ === "datum" && ISO_DATUM.test(f.wert) ? f.wert.split("-").reverse().join(".") : f.wert;
    const text = sicher(font, roh);
    let size = Math.min(f.h * 0.72, 12);
    while (size > 5 && font.widthOfTextAtSize(text, size) > f.w - 2) size -= 0.25;
    imRechteck(page, f, () => {
      page.drawText(text, { x: 1.5, y: Math.max(1, f.h * 0.24), size, font, color: F.tinte });
    });
  }
}

/** Hat der Unterzeichner elektronisch unterschrieben (online oder intern)? */
export const elektronisch = (s: SignerPdf) => s.status === "unterschrieben" && !!s.signed_at;

/**
 * Setzt die Unterschriften aller elektronisch unterschriebenen Unterzeichner an ihre
 * Platzierungen und schreibt die Fußzeile auf jede Seite mit mindestens einer Unterschrift.
 */
export async function stempeln(doc: Doc, signers: SignerPdf[], o: StempelOptionen) {
  const f = await fonts(doc);
  const pages = doc.getPages();
  const eingeklammert = new Set<number>();
  const klammern = (idx: number) => {
    if (eingeklammert.has(idx) || !pages[idx]) return;
    eingeklammert.add(idx);
    inhaltEinklammern(doc, pages[idx]);
  };
  if (o.felder?.length) felderZeichnen(pages, o.felder, f.normal, klammern);
  if (o.ergaenzungen?.length) ergaenzungenZeichnen(pages, o.ergaenzungen, f.normal, klammern);
  const ersetzungen = ersetzungenAus(o.felder ?? [], o.ergaenzungen ?? []);
  if (ersetzungen.length) ersetzungenZeichnen(pages, ersetzungen, f.normal, klammern);
  const letzteUnterschrift = new Map<number, string>(); // Seite → späteste Zeit
  const bilder = new Map<string, unknown>();

  for (const s of signers.filter(elektronisch)) {
    for (const pl of s.placements ?? []) {
      const page = pages[pl.page];
      if (!page || !(pl.w > 0) || !(pl.h > 0)) continue;
      if (!eingeklammert.has(pl.page)) {
        eingeklammert.add(pl.page);
        inhaltEinklammern(doc, page);
      }
      const vorher = letzteUnterschrift.get(pl.page);
      if (!vorher || s.signed_at! > vorher) letzteUnterschrift.set(pl.page, s.signed_at!);

      // Bild vorbereiten
      // deno-lint-ignore no-explicit-any
      let img: any = null;
      if (s.signature_png) {
        img = bilder.get(s.id);
        if (!img) {
          try {
            img = await doc.embedPng(base64ZuBytes(unterschriftZuschneiden(s.signature_png)!));
            bilder.set(s.id, img);
          } catch (e) {
            console.error("[signatur] Unterschriftsbild nicht lesbar:", e);
          }
        }
      }
      const name = sicher(f.normal, s.name);
      const zeit = datumZeit(s.signed_at);
      // Ort (interne Unterschrift) nur in der kleinen grauen Zeile unter der Unterschrift –
      // nicht mehr als eigener Text neben dem Feld (überlappte dort andere Unterschriften).
      const ort = s.methode === "intern" && s.ort_datum !== false ? (s.ort || o.standardOrt || "").trim() : "";
      const unterzeile = ort
        ? `${name} · elektronisch unterschrieben in ${sicher(f.normal, ort)} am ${zeit}`
        : `${name} · elektronisch unterschrieben am ${zeit}`;

      imRechteck(page, pl, () => {
        if (img) {
          // Zugeschnittenes Bild darf etwas über das Feld nach oben ragen (wie auf Papier)
          // links beginnend (kleiner Einzug), nicht mittig
          const ein = Math.min(UNTERSCHRIFT.EINZUG, pl.w / 4);
          const sk = Math.min((pl.w - ein) / img.width, (pl.h * (1 + UNTERSCHRIFT.UEBERSTAND)) / img.height);
          const dw = img.width * sk;
          const dh = img.height * sk;
          page.drawImage(img, { x: ein, y: 0, width: dw, height: dh });
        } else {
          const text = sicher(f.kursiv, s.typed_name || s.name);
          let size = Math.min(pl.h * 0.7, 26);
          const ein = Math.min(UNTERSCHRIFT.EINZUG, pl.w / 4);
          while (size > 6 && f.kursiv.widthOfTextAtSize(text, size) > pl.w - ein) size -= 0.5;
          page.drawText(text, { x: ein, y: Math.max(1, pl.h * 0.18), size, font: f.kursiv, color: F.tinte });
        }
        // Unter der Beschriftung der Linie, nicht darauf
        page.drawText(sicher(f.normal, unterzeile), { x: 0, y: -UNTERSCHRIFT.ZEILE_ABSTAND, size: UNTERSCHRIFT.ZEILE_GROESSE, font: f.normal, color: F.grau });
      });
    }
  }

  for (const [idx, zeit] of letzteUnterschrift) fusszeile(doc, pages[idx], f.normal, o.nummer, zeit, eingeklammert.has(idx));
}

/** Fußzeile „Elektronisch unterschrieben über RGI Immobilien · SIG-… · TT.MM.JJJJ, HH:MM“ (8 pt, grau, unten mittig). */
export function fusszeile(doc: Doc, page: Page, font: Font, nummer: string, zeit: string, schonEingeklammert = false) {
  if (!schonEingeklammert) inhaltEinklammern(doc, page);
  const v = ansichtsGroesse(page);
  const text = sicher(font, `Elektronisch unterschrieben über RGI Immobilien · ${nummer} · ${datumZeit(zeit)}`);
  const tw = font.widthOfTextAtSize(text, 8);
  imRechteck(page, { x: 0, y: v.h - 18, w: v.w, h: 12 }, () => {
    page.drawText(text, { x: Math.max(4, (v.w - tw) / 2), y: 3, size: 8, font, color: F.hell });
  });
}

/** Kleine Kopfzeile über eingefügten Papier-Scans. */
export function kopfzeile(page: Page, font: Font, text: string) {
  const v = ansichtsGroesse(page);
  const t = sicher(font, text);
  const tw = font.widthOfTextAtSize(t, 7.5);
  imRechteck(page, { x: 0, y: 2, w: v.w, h: 12 }, () => {
    page.drawRectangle({ x: Math.max(2, (v.w - tw) / 2 - 4), y: 0, width: tw + 8, height: 11, color: rgb(1, 1, 1), opacity: 0.85 });
    page.drawText(t, { x: Math.max(6, (v.w - tw) / 2), y: 3, size: 7.5, font, color: F.grau });
  });
}

// ---------------------------------------------------------------- ETV-Unterschriftsseite

/**
 * Ergänzt auf der von unterschriftenSeiteAnhaengen erzeugten Seite die getippten Namen
 * (ohne gezeichnetes Bild) kursiv auf der Unterschriftslinie der jeweiligen Rolle.
 * Die Lage entspricht exakt dem Aufbau in _shared/protokoll-unterschriften.ts
 * (erste Linie bei y = 607,89, Abstand 112 Punkte je Rolle, Bild bei x = 265).
 */
export async function etvNamenErgaenzen(
  doc: Doc,
  seite: Page,
  eintraege: { index: number; name: string }[],
) {
  const f = await fonts(doc);
  const H = seite.getSize().height;
  for (const e of eintraege) {
    const grund = H - 234 - e.index * 112; // 841,89 − 234 = 607,89
    const t = sicher(f.kursiv, e.name);
    let size = 20;
    while (size > 8 && f.kursiv.widthOfTextAtSize(t, size) > 230) size -= 0.5;
    seite.drawText(t, { x: 265, y: grund + 8, size, font: f.kursiv, color: F.tinte });
  }
}

/** 1×1 transparentes PNG – Platzhalter für etv_protocol_signatures.signature_png (Pflichtfeld) bei getipptem Namen. */
export const LEERES_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

// ---------------------------------------------------------------- Papier zusammenfügen

export interface PapierDatei {
  name: string;
  bytes: Uint8Array;
}

/** EXIF-Ausrichtung eines JPEG (1 = normal, 3 = 180°, 6 = 90° im Uhrzeigersinn, 8 = 90° gegen den Uhrzeigersinn). */
export function exifAusrichtung(b: Uint8Array): number {
  try {
    let p = 2;
    while (p + 4 < b.length && b[p] === 0xff) {
      const marker = b[p + 1];
      const len = (b[p + 2] << 8) | b[p + 3];
      if (marker === 0xe1 && String.fromCharCode(...b.subarray(p + 4, p + 8)) === "Exif") {
        const t = p + 10; // TIFF-Kopf
        const le = b[t] === 0x49;
        const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
        const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
        const ifd = t + u32(t + 4);
        const n = u16(ifd);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (u16(e) === 0x0112) return u16(e + 8) || 1;
        }
        return 1;
      }
      if (marker === 0xda) break; // Bilddaten beginnen
      p += 2 + len;
    }
  } catch {
    // ohne EXIF
  }
  return 1;
}

/**
 * Fügt Fotos (JPG/PNG, je eine A4-Seite, proportional eingepasst, EXIF-Drehung beachtet)
 * und PDFs (Seiten übernommen) in der gegebenen Reihenfolge zu einem PDF zusammen.
 */
export async function papierZusammenfuegen(dateien: PapierDatei[]): Promise<{ bytes: Uint8Array; seiten: number; fotos: number }> {
  const doc = await PDFDocument.create();
  let fotos = 0;
  for (const d of dateien) {
    const b = d.bytes;
    if (istHeic(b)) throw new Fehler(400, "Bitte als JPG oder PDF senden (HEIC-Fotos werden nicht unterstützt).");
    if (istPdf(b)) {
      let src: Doc;
      try {
        src = await PDFDocument.load(b, { ignoreEncryption: true, updateMetadata: false });
      } catch {
        throw new Fehler(400, `„${d.name}“ ist kein lesbares PDF.`);
      }
      const kopien = await doc.copyPages(src, src.getPageIndices());
      kopien.forEach((p: Page) => doc.addPage(p));
    } else if (istJpg(b) || istPng(b)) {
      fotos++;
      // deno-lint-ignore no-explicit-any
      let img: any;
      try {
        img = istJpg(b) ? await doc.embedJpg(b) : await doc.embedPng(b);
      } catch {
        throw new Fehler(400, `„${d.name}“ konnte nicht gelesen werden. Bitte als JPG oder PDF senden.`);
      }
      const ori = istJpg(b) ? exifAusrichtung(b) : 1;
      const gedreht = ori === 6 || ori === 8;
      const bw = gedreht ? img.height : img.width; // angezeigte Breite/Höhe
      const bh = gedreht ? img.width : img.height;
      const quer = bw > bh * 1.05;
      const [pw, ph] = quer ? [A4[1], A4[0]] : A4;
      const rand = 14;
      const sk = Math.min((pw - 2 * rand) / bw, (ph - 2 * rand) / bh);
      const zw = bw * sk; // angezeigt
      const zh = bh * sk;
      const bx = (pw - zw) / 2;
      const by = (ph - zh) / 2;
      const page = doc.addPage([pw, ph]);
      const rw = img.width * sk; // Rohbild gezeichnet
      const rh = img.height * sk;
      if (ori === 6) page.drawImage(img, { x: bx, y: by + rw, width: rw, height: rh, rotate: degrees(-90) });
      else if (ori === 8) page.drawImage(img, { x: bx + rh, y: by, width: rw, height: rh, rotate: degrees(90) });
      else if (ori === 3) page.drawImage(img, { x: bx + rw, y: by + rh, width: rw, height: rh, rotate: degrees(180) });
      else page.drawImage(img, { x: bx, y: by, width: rw, height: rh });
    } else {
      throw new Fehler(400, `„${d.name}“: Dateityp nicht unterstützt. Bitte als JPG oder PDF senden.`);
    }
  }
  if (doc.getPageCount() === 0) throw new Fehler(400, "Keine Seiten gefunden.");
  return { bytes: await doc.save(), seiten: doc.getPageCount(), fotos };
}

// ---------------------------------------------------------------- Prüfblatt (v06/v07)

export interface PruefblattDaten {
  modus: "anlage" | "nachweis";
  titel: string;
  objekt: string;
  nummer: string;
  abgeschlossenAm: string | null;
  signers: SignerPdf[];
  sha256: string | null;
  zeitstempel: { zeit: string; dienst: string } | null;
  /** ETV-Protokoll: keine Kopie per Mail */
  ohneKopie?: boolean;
  /** Ausfüllfelder (wer hat welches Feld wann ausgefüllt) */
  felder?: FeldPdf[];
  /** Ergänzungen/Korrekturen der Unterzeichner (wer, wann, Seite, Text) */
  ergaenzungen?: ErgaenzungPdf[];
}

function rundesRechteck(page: Page, x: number, yOben: number, w: number, h: number, r: number, o: { fill?: unknown; rand?: unknown }) {
  const p = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  page.drawSvgPath(p, {
    x,
    y: yOben,
    color: o.fill,
    borderColor: o.rand,
    borderWidth: o.rand ? 0.75 : 0,
  });
}

/** Zeilen (Bezeichnung/Wert) für die Karte eines Unterzeichners. */
function kartenZeilen(s: SignerPdf, ohneKopie: boolean): [string, string][] {
  const kopie = ohneKopie ? "nicht vorgesehen (Protokollversand)" : s.copy_sent_at ? `${datumZeit(s.copy_sent_at)} Uhr` : "–";
  if (s.status === "papier_uebernommen") {
    const pr = s.paper_pruefung as { geprueft_am?: string } | null;
    return [
      ["Unterschrieben", "auf Papier (handschriftlich)"],
      ["Eingegangen", `${datumZeit(s.paper_eingang_at)} Uhr per ${s.paper_eingang === "email" ? "E-Mail" : "Upload"}`],
      ["Prüfung", `Seitenvergleich durch RGI${pr?.geprueft_am ? ` am ${datumZeit(pr.geprueft_am)} Uhr` : ""}`],
      ["Seiten", `${s.paper_page_count ?? "?"} Seiten, als Scan angehängt`],
      ["Kopie gesendet", ohneKopie ? kopie : "mit der Endfassung"],
    ];
  }
  if (s.status === "unterschrieben" && s.methode === "intern") {
    return [
      ["Unterschrieben", `${datumZeit(s.signed_at, true)} Uhr`],
      ["E-Mail (Link)", "intern (VerwaltungsApp)"],
      ["Bestätigung", "Freigabe durch angemeldeten Mitarbeiter"],
      ["IP / Gerät", "VerwaltungsApp"],
      ["Kopie gesendet", ohneKopie ? kopie : "an alle Unterzeichner"],
    ];
  }
  if (s.status === "unterschrieben") {
    return [
      ["Unterschrieben", `${datumZeit(s.signed_at, true)} Uhr`],
      ["E-Mail (Link)", s.email || "–"],
      ["Bestätigung", `Name eingegeben, Zustimmung erteilt${s.signature_png ? ", Unterschrift gezeichnet" : ""}`],
      ["IP / Gerät", [s.ip || "–", geraet(s.user_agent)].filter(Boolean).join(" · ")],
      ["Kopie gesendet", kopie],
    ];
  }
  const st: Record<string, string> = {
    wartet: "wartet (noch nicht an der Reihe)",
    offen: "eingeladen, noch nicht unterschrieben",
    geoeffnet: "Dokument geöffnet, noch nicht unterschrieben",
    papier_eingegangen: "Papier-Unterschrift eingegangen, Prüfung ausstehend",
    abgelehnt: "Papier abgelehnt, neu angefordert",
    zurueckgezogen: "zurückgezogen",
  };
  return [["Status", st[s.status] ?? s.status], ["E-Mail (Link)", s.methode === "intern" ? "intern (VerwaltungsApp)" : s.email || "–"]];
}

/** Hängt das Prüfblatt (eine oder mehrere Seiten) an `doc` an. */
export async function pruefblattAnhaengen(doc: Doc, d: PruefblattDaten) {
  const f = await fonts(doc);
  const lb = await logoLaden();
  // deno-lint-ignore no-explicit-any
  const logo: any = lb ? await doc.embedPng(lb).catch(() => null) : null;
  const LOGO_H = 120 * (274 / 728);
  const [W, H] = A4;
  const M = 51; // Rand
  const B = W - 2 * M; // Inhaltsbreite
  const UNTEN = 78; // unterhalb beginnt die Fußzeile
  const neueSeiten: Page[] = [];
  let page: Page;
  let y = 0;

  const kopf = (erste: boolean) => {
    page = doc.addPage(A4);
    neueSeiten.push(page);
    const lw = 120;
    const lh = logo ? lw * (logo.height / logo.width) : LOGO_H;
    if (logo) page.drawImage(logo, { x: W - M - lw, y: H - 40 - lh, width: lw, height: lh });
    y = H - 40 - lh - 4;
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 1.2, color: F.orange });
    y -= 6;
    // Fußzeile
    page.drawLine({ start: { x: M, y: 52 }, end: { x: W - M, y: 52 }, thickness: 0.6, color: F.rand });
    const fz = sicher(f.normal, FIRMA_ZEILE);
    page.drawText(fz, { x: (W - f.normal.widthOfTextAtSize(fz, 7)) / 2, y: 40, size: 7, font: f.normal, color: F.grau });
    if (erste) {
      const t = "Prüfblatt zur elektronischen Unterschrift";
      y -= 36;
      page.drawText(t, { x: (W - f.fett.widthOfTextAtSize(t, 19)) / 2, y, size: 19, font: f.fett, color: F.akzent });
      y -= 22;
    } else {
      y -= 20;
    }
  };
  const platz = (h: number) => {
    if (y - h < UNTEN) kopf(false);
  };
  const ueberschrift = (t: string) => {
    platz(40);
    y -= 14;
    page.drawText(t, { x: M, y, size: 10, font: f.fett, color: F.akzent });
    y -= 10;
  };

  kopf(true);

  // ---- Infobox
  const info: [string, string, boolean][] = [
    ["Dokument", d.titel, true],
    ["Objekt", d.objekt || "–", false],
    ["Vorgangs-Nr.", d.nummer, false],
    [d.abgeschlossenAm ? "Abgeschlossen am" : "Stand", d.abgeschlossenAm ? `${datumZeit(d.abgeschlossenAm)} Uhr` : `${datumZeit(new Date())} Uhr (noch nicht abgeschlossen)`, false],
    ["Form", "Textform nach § 126b BGB", false],
  ];
  const infoZeilen = info.map(([k, v, fett]) => ({ k, z: umbrechen(fett ? f.fett : f.normal, v, 9, B - 150), fett }));
  const infoH = 12 + infoZeilen.reduce((a, r) => a + r.z.length * 13 + 3.5, 0) + 8;
  page.drawRectangle({ x: M, y: y - infoH, width: B, height: infoH, color: F.creme });
  page.drawRectangle({ x: M, y: y - infoH, width: 19, height: infoH, color: F.orange });
  let iy = y - 12 - 9;
  for (const r of infoZeilen) {
    page.drawText(r.k, { x: M + 34, y: iy, size: 9, font: f.normal, color: F.grau });
    r.z.forEach((z, i) => page.drawText(z, { x: M + 163, y: iy - i * 13, size: 9, font: r.fett ? f.fett : f.normal, color: F.text }));
    iy -= r.z.length * 13 + 3.5;
  }
  y -= infoH + 8;

  // ---- Unterschriften
  ueberschrift("Unterschriften");
  const LINKS = 157;
  const LX = M + LINKS + 10; // Bezeichnungen
  const WX = M + 266; // Werte
  const WB = W - M - 10 - WX;
  for (const s of d.signers) {
    const zeilen = kartenZeilen(s, !!d.ohneKopie).map(([k, v]) => ({ k, z: umbrechen(f.normal, v, 7.6, WB) }));
    const rechtsH = 10 + zeilen.reduce((a, r) => a + r.z.length * 10.2 + 2.6, 0) + 6;
    const nameZ = umbrechen(f.fett, s.name, 8.5, LINKS - 22);
    const linksH = 12 + 30 + nameZ.length * 10.5 + (s.rolle ? 11 : 0) + 8;
    const h = Math.max(rechtsH, linksH, 64);
    platz(h + 8);
    const top = y;
    // Karte
    rundesRechteck(page, M, top, B, h, 5, { fill: rgb(1, 1, 1), rand: F.rand });
    page.drawRectangle({ x: M + 0.6, y: top - h + 0.6, width: LINKS, height: h - 1.2, color: F.orangeHell });
    // links: Unterschrift / getippter Name
    const sx = M + 11;
    const sy = top - 12 - 26; // Unterkante Unterschriftsbereich
    if (s.status === "papier_uebernommen") {
      page.drawText("Papier-Unterschrift", { x: sx, y: sy + 6, size: 13, font: f.kursiv, color: F.grau });
    } else if (s.status === "unterschrieben" && s.signature_png) {
      try {
        const img = await doc.embedPng(base64ZuBytes(s.signature_png));
        const sk = Math.min((LINKS - 22) / img.width, 28 / img.height);
        page.drawImage(img, { x: sx, y: sy, width: img.width * sk, height: img.height * sk });
      } catch {
        page.drawText(sicher(f.kursiv, s.typed_name || s.name), { x: sx, y: sy + 6, size: 16, font: f.kursiv, color: F.tinte });
      }
    } else if (s.status === "unterschrieben") {
      const t = sicher(f.kursiv, s.typed_name || s.name);
      let sz = 17;
      while (sz > 8 && f.kursiv.widthOfTextAtSize(t, sz) > LINKS - 22) sz -= 0.5;
      page.drawText(t, { x: sx, y: sy + 6, size: sz, font: f.kursiv, color: F.tinte });
    } else {
      page.drawText("noch offen", { x: sx, y: sy + 6, size: 11, font: f.kursiv, color: F.hell });
    }
    let ly = sy - 12;
    for (const z of nameZ) {
      page.drawText(z, { x: sx, y: ly, size: 8.5, font: f.fett, color: F.text });
      ly -= 10.5;
    }
    if (s.rolle) page.drawText(sicher(f.normal, s.rolle), { x: sx, y: ly, size: 7.6, font: f.normal, color: F.grau });
    // rechts: Nachweisdaten
    let ry = top - 10 - 7.6;
    for (const r of zeilen) {
      page.drawText(r.k, { x: LX, y: ry, size: 7.6, font: f.normal, color: F.grau });
      r.z.forEach((z, i) => page.drawText(z, { x: WX, y: ry - i * 10.2, size: 7.6, font: f.normal, color: F.text }));
      ry -= r.z.length * 10.2 + 2.6;
    }
    y = top - h - 8;
  }

  // ---- Ausgefüllte Felder (wer hat welches Feld wann ausgefüllt)
  const gefuellt = (d.felder ?? []).filter((x) => x.wert && x.typ !== "vorbelegt");
  if (gefuellt.length) {
    const wertTxt = (x: FeldPdf) => x.typ === "datum" && ISO_DATUM.test(x.wert!) ? x.wert!.split("-").reverse().join(".")
      : x.typ === "ankreuz" || x.typ === "auswahl" ? "angekreuzt" : x.wert!;
    const zeilenF = gefuellt.map((x) => ({
      k: umbrechen(f.normal, x.beschriftung || "Feld", 7.6, 175),
      v: umbrechen(f.fett, wertTxt(x), 7.6, 110),
      wer: umbrechen(f.normal, `${x.wert_gesetzt_von || (x.ausfueller === "rgi" ? "RGI Immobilien (vorab)" : "–")}${x.wert_gesetzt_am ? ` · ${datumZeit(x.wert_gesetzt_am)} Uhr` : ""}`, 7.6, B - 322),
    }));
    platz(60);
    ueberschrift("Ausgefüllte Felder");
    for (const r of zeilenF) {
      const zh = Math.max(r.k.length, r.v.length, r.wer.length) * 10.2 + 3;
      platz(zh + 4);
      r.k.forEach((z, i) => page.drawText(z, { x: M + 10, y: y - 7.6 - i * 10.2, size: 7.6, font: f.normal, color: F.grau }));
      r.v.forEach((z, i) => page.drawText(z, { x: M + 195, y: y - 7.6 - i * 10.2, size: 7.6, font: f.fett, color: F.text }));
      r.wer.forEach((z, i) => page.drawText(z, { x: M + 315, y: y - 7.6 - i * 10.2, size: 7.6, font: f.normal, color: F.text }));
      y -= zh;
    }
    y -= 6;
  }

  // ---- Ergänzungen und Korrekturen der Unterzeichner (wer, wann, Seite, Text)
  // geänderte vorbelegte Angaben („Name: alt → neu“) + Korrekturen („Statt „…“: …“) + Ergänzungen
  const geaendert = (d.felder ?? []).filter((x) => x.typ === "vorbelegt" && x.wert);
  const erg = d.ergaenzungen ?? [];
  if (erg.length || geaendert.length) {
    const wer = (von?: string | null, am?: string | null) => umbrechen(f.normal, `${von || "–"}${am ? ` · ${datumZeit(am)} Uhr` : ""}`, 7.6, B - 345);
    const zeilenE = [
      ...geaendert.map((x) => ({
        k: umbrechen(f.normal, `Seite ${x.page + 1} · Änderung`, 7.6, 95),
        v: umbrechen(f.fett, `${x.beschriftung || "Angabe"}: ${x.ausgangswert ?? ""} » ${x.wert}`, 7.6, 225), // „→“ kann die Standardschrift nicht
        wer: wer(x.wert_gesetzt_von, x.wert_gesetzt_am),
      })),
      ...erg.map((x) => ({
        k: umbrechen(f.normal, `Seite ${x.page + 1} · ${x.art === "korrektur" ? "Korrektur" : "Ergänzung"}`, 7.6, 95),
        v: umbrechen(f.fett, x.art === "korrektur"
          ? x.original_text
            ? fussnotenText({ alt: x.original_text, neu: x.text })
            : `markierte Stelle ersetzt durch „${x.text.replace(/\s*\n\s*/g, " / ")}“`
          : `„${x.text.replace(/\s*\n\s*/g, " / ")}“`, 7.6, 225),
        wer: wer(x.erstellt_von, x.erstellt_am),
      })),
    ];
    platz(60);
    ueberschrift("Änderungen, Korrekturen und Ergänzungen der Unterzeichner");
    for (const r of zeilenE) {
      const zh = Math.max(r.k.length, r.v.length, r.wer.length) * 10.2 + 3;
      platz(zh + 4);
      r.k.forEach((z, i) => page.drawText(z, { x: M + 10, y: y - 7.6 - i * 10.2, size: 7.6, font: f.normal, color: F.grau }));
      r.v.forEach((z, i) => page.drawText(z, { x: M + 110, y: y - 7.6 - i * 10.2, size: 7.6, font: f.fett, color: F.blau }));
      r.wer.forEach((z, i) => page.drawText(z, { x: M + 345, y: y - 7.6 - i * 10.2, size: 7.6, font: f.normal, color: F.text }));
      y -= zh;
    }
    const hinweis = umbrechen(f.normal, "Diese Angaben haben die Unterzeichner beim Unterschreiben selbst geändert, korrigiert bzw. ergänzt. Sie sind im Dokument dunkelblau eingesetzt, der ursprüngliche Text ist durchgestrichen (bei wenig Platz als Fußnote unten auf der Seite).", 7, B - 10);
    platz(hinweis.length * 9.5 + 4);
    y -= 3;
    for (const z of hinweis) {
      page.drawText(z, { x: M + 10, y: y - 7, size: 7, font: f.normal, color: F.grau });
      y -= 9.5;
    }
    y -= 6;
  }

  // ---- Unveränderbarkeit (Überschrift erst, wenn klar ist, dass der Kasten auf die Seite passt)
  const anlage = d.modus === "anlage";
  const fp = anlage
    ? `wird für diese Datei berechnet und bei RGI hinterlegt (Vorgang ${d.nummer})`
    : d.sha256 || "wird bei Abschluss berechnet";
  const zs = anlage
    ? "RFC 3161 über den Fingerabdruck, bei RGI hinterlegt"
    : d.zeitstempel
    ? `${datumZeit(d.zeitstempel.zeit, true)} Uhr · ${d.zeitstempel.dienst.replace(/^https?:\/\//, "")} (RFC 3161)`
    : d.sha256
    ? "nicht verfügbar (Zeitstempeldienst nicht erreichbar)"
    : "wird bei Abschluss gesetzt";
  const pruef = anlage
    ? "Fingerabdruck dieser Datei (SHA-256) neu berechnen und mit dem bei RGI hinterlegten Wert vergleichen, oder Vorgangs-Nr. bei RGI anfragen."
    : `Fingerabdruck der Endfassung (final.pdf zum Vorgang ${d.nummer}) neu berechnen und mit diesem Wert vergleichen, oder Vorgangs-Nr. bei RGI anfragen.`;
  const ux = [
    { k: "Fingerabdruck (SHA-256)", z: umbrechen(d.sha256 && !anlage ? f.mono : f.normal, fp, 7.6, B - 150), mono: !!(d.sha256 && !anlage) },
    { k: "Zeitstempel", z: umbrechen(f.normal, zs, 7.6, B - 150), mono: false },
    { k: "Prüfung", z: umbrechen(f.normal, pruef, 7.6, B - 150), mono: false },
  ];
  const uh = 10 + ux.reduce((a, r) => a + r.z.length * 10.2 + 3, 0) + 6;
  platz(uh + 70);
  ueberschrift("Unveränderbarkeit");
  rundesRechteck(page, M, y, B, uh, 5, { fill: F.box });
  let uy = y - 10 - 7.6;
  for (const r of ux) {
    page.drawText(r.k, { x: M + 10, y: uy, size: 7.6, font: f.normal, color: F.grau });
    r.z.forEach((z, i) => page.drawText(z, { x: M + 140, y: uy - i * 10.2, size: 7.6, font: r.mono ? f.mono : f.normal, color: F.text }));
    uy -= r.z.length * 10.2 + 3;
  }
  y -= uh + 14;

  // ---- Erläuterung
  const erl = "Die Online-Unterzeichner haben das Dokument über einen persönlichen Link geöffnet, ihren Namen angegeben und der Erklärung „Ich habe das Dokument gelesen und stimme seinem Inhalt verbindlich zu“ zugestimmt. " +
    "Papier-Unterschriften wurden als Scan aller Seiten zurückgesendet und von RGI Seite für Seite geprüft." +
    (d.ohneKopie ? "" : " Jeder Unterzeichner erhält das vollständige Dokument per E-Mail.");
  const ez = umbrechen(f.normal, erl, 7, B);
  platz(ez.length * 9.5 + 4);
  for (const z of ez) {
    page.drawText(z, { x: M, y, size: 7, font: f.normal, color: F.grau });
    y -= 9.5;
  }

  // Seitenangabe links oben (erst jetzt ist die Gesamtzahl bekannt)
  const gesamt = doc.getPageCount();
  const erste = gesamt - neueSeiten.length;
  neueSeiten.forEach((p: Page, i: number) => {
    const t = d.modus === "anlage"
      ? `Anlage zum Dokument · Seite ${erste + i + 1} von ${gesamt}`
      : `Nachweis zum Vorgang ${d.nummer} · Seite ${i + 1} von ${neueSeiten.length}`;
    const lh = logo ? 120 * (logo.height / logo.width) : LOGO_H;
    p.drawText(sicher(f.normal, t), { x: M, y: H - 40 - lh + 2, size: 7.5, font: f.normal, color: F.grau });
  });
}

/** Eigenes Nachweis-PDF (Knopf „Nachweis als PDF“). */
export async function nachweisPdf(d: PruefblattDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Nachweis ${d.nummer}`);
  doc.setAuthor("RGI Immobilien GmbH & Co. KG");
  await pruefblattAnhaengen(doc, { ...d, modus: "nachweis" });
  return await doc.save();
}

export { PDFDocument };
