// Elektronische Unterschrift – Unterschriftsstellen in einem PDF erkennen (für den Claude-Konnektor).
// Liest Text und waagerechte Linien mit Positionen (pdf.js über unpdf) und schlägt Unterschriftsfelder vor.
// Koordinaten wie placements (src/lib/pdfSign.ts): PDF-Punkte, Ursprung oben links der angezeigten Seite
// (CropBox und Drehung berücksichtigt). Seiten hier 1-basiert (seite 1 = erste Seite).
import { getDocumentProxy, getResolvedPDFJS } from "npm:unpdf@1.8.1";

export const FELD_BREITE = 160;
export const FELD_HOEHE = 40;

export interface Vorschlag {
  seite: number; // 1-basiert
  x: number;
  y: number;
  w: number;
  h: number;
  beschriftung: string;
  kontext: string;
  quelle: "linie+beschriftung" | "unterstrich" | "beschriftung" | "linie";
  sicherheit: "hoch" | "mittel" | "niedrig";
}

export interface OrtDatum {
  seite: number;
  x: number;
  y: number;
  text: string;
}

export interface Analyse {
  seitenzahl: number;
  seiten: { seite: number; breite: number; hoehe: number; textauszug: string }[];
  vorschlaege: Vorschlag[];
  ort_datum_stellen: OrtDatum[];
  hinweis?: string;
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Zeile = Box & { text: string; teile: { str: string; box: Box }[] };
type Linie = Box & { art: "unterstrich" | "vektor"; zeile?: Zeile; davor?: string };

// Beschriftungen, die für sich allein eine Unterschriftsstelle anzeigen
const STARK = /unterschrift|unterzeichne|beiratsvorsitz|versammlungsleit|protokollf(ü|ue)hr|protokollant|firmenstempel|stempel und/i;
// Beschriftungen ohne Linie: nur echte Unterschrifts-Beschriftungen (keine Verben im Fließtext)
const BESCHRIFTUNG = /unterschrift|unterzeichner|beiratsvorsitz|versammlungsleit|protokollf(ü|ue)hr|protokollant|stempel/i;
// Rollen, die nur in kurzen Zeilen direkt an einer Linie als Beschriftung zählen
const ROLLE = /auftraggeber|auftragnehmer|verwalter|verwaltung|eigent(ü|ue)mer|beirat|vermieter|mieter|hausmeister|dienstleister|bevollm(ä|ae)chtigt|vollmachtgeber|gemeinschaft|\bweg\b|rgi|immobilien|gmbh|vertreten|f(ü|ue)r die/i;
const ORT_DATUM = /\bort\b.{0,6}\bdatum\b|\bdatum\b.{0,6}\bort\b/i;
const UNTERSTRICH = /_{6,}|\.{10,}|…{4,}/g;
const HAT_UNTERSTRICH = /_{6,}|\.{10,}|…{4,}/;
// Überschriften wie „Unterschriften“ sind keine Unterschriftsstelle
const UEBERSCHRIFT = /^\s*unterschriften\s*:?\s*$|unterschriften?(seite|liste|feld)|elektronisch unterschrieben/i;

const r1 = (n: number) => Math.round(n * 10) / 10;

function mult(m: number[], n: number[]): number[] {
  // m wirkt zuerst, dann n (PDF-Konvention: neu = m × n)
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}
const anwenden = (m: number[], x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// deno-lint-ignore no-explicit-any
function ansichtsBox(vp: any, x0: number, y0: number, x1: number, y1: number): Box {
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => vp.convertToViewportPoint(x, y) as number[]);
  return {
    x0: Math.min(...pts.map((p) => p[0])),
    y0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])),
    y1: Math.max(...pts.map((p) => p[1])),
  };
}

/** Textstücke einer Seite zu Zeilen zusammenfassen (Ansichtskoordinaten). */
// deno-lint-ignore no-explicit-any
function zeilenBilden(items: any[], vp: any): Zeile[] {
  const teile: { str: string; box: Box }[] = [];
  for (const it of items) {
    const str = String(it?.str ?? "");
    if (!str.trim() || !Array.isArray(it.transform)) continue;
    const [a, b, , , e, f] = it.transform;
    const fs = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
    // Unsichtbare Vorlagen-Anker (1 pt) gehören nicht zum lesbaren Text
    if (fs <= 1.5) continue;
    const len = it.width || str.length * fs * 0.5;
    // Laufrichtung des Textes im Benutzerraum
    const n = Math.hypot(a, b) || 1;
    const ux = a / n, uy = b / n;
    const xs = [e, e + ux * len, e - uy * fs, e + ux * len - uy * fs];
    const ys = [f, f + uy * len, f + ux * fs, f + uy * len + ux * fs];
    teile.push({ str, box: ansichtsBox(vp, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)) });
  }
  teile.sort((p, q) => p.box.y1 - q.box.y1 || p.box.x0 - q.box.x0);
  const zeilen: Zeile[] = [];
  for (const t of teile) {
    const hoehe = t.box.y1 - t.box.y0;
    const z = zeilen.find((z) => Math.abs(z.y1 - t.box.y1) <= Math.max(2.5, hoehe * 0.3));
    if (z) {
      z.teile.push(t);
      z.x0 = Math.min(z.x0, t.box.x0);
      z.x1 = Math.max(z.x1, t.box.x1);
      z.y0 = Math.min(z.y0, t.box.y0);
    } else {
      zeilen.push({ ...t.box, text: "", teile: [t] });
    }
  }
  for (const z of zeilen) {
    z.teile.sort((p, q) => p.box.x0 - q.box.x0);
    let text = "";
    let rechts = -Infinity;
    for (const t of z.teile) {
      if (text && t.box.x0 - rechts > 1.5 && !text.endsWith(" ") && !t.str.startsWith(" ")) text += t.box.x0 - rechts > 25 ? "   " : " ";
      text += t.str;
      rechts = Math.max(rechts, t.box.x1);
    }
    z.text = text.replace(/\s+$/, "");
  }
  return zeilen.sort((p, q) => p.y1 - q.y1);
}

/** Unterstrich-/Punktlinien im Text („________“, „..........“) mit ungefährer Lage. */
function unterstriche(zeilen: Zeile[]): Linie[] {
  const out: Linie[] = [];
  for (const z of zeilen) {
    for (const t of z.teile) {
      UNTERSTRICH.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = UNTERSTRICH.exec(t.str))) {
        const breite = t.box.x1 - t.box.x0;
        const x0 = t.box.x0 + (m.index / t.str.length) * breite;
        const x1 = t.box.x0 + ((m.index + m[0].length) / t.str.length) * breite;
        if (x1 - x0 < 40) continue;
        // Text links vom Unterstrich in derselben Zeile (andere Textstücke + Anfang dieses Stücks)
        const davor = [...z.teile.filter((x) => x !== t && x.box.x1 <= t.box.x0 + 1).map((x) => x.str), t.str.slice(0, m.index)].join(" ");
        out.push({ x0, x1, y0: t.box.y1 - 1, y1: t.box.y1, art: "unterstrich", zeile: z, davor });
      }
    }
  }
  return out;
}

/** Waagerechte Vektorlinien (Striche oder sehr flache Rechtecke) aus der Operatorliste. */
// deno-lint-ignore no-explicit-any
async function vektorLinien(page: any, vp: any, OPS: any): Promise<Linie[]> {
  const ol = await page.getOperatorList();
  const out: Linie[] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stapel: number[][] = [];
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i];
    if (fn === OPS.save) stapel.push(ctm);
    else if (fn === OPS.restore) ctm = stapel.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform && args?.length === 6) ctm = mult(Array.from(args as number[]), ctm);
    else if (fn === OPS.paintFormXObjectBegin) {
      stapel.push(ctm);
      if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = mult(Array.from(args[0] as number[]), ctm);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stapel.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.constructPath) {
      const mm = args?.[2];
      if (!mm || mm.length < 4 || !Number.isFinite(mm[0])) continue;
      const ecken = [anwenden(ctm, mm[0], mm[1]), anwenden(ctm, mm[2], mm[3]), anwenden(ctm, mm[0], mm[3]), anwenden(ctm, mm[2], mm[1])];
      const b = ansichtsBox(vp, Math.min(...ecken.map((e) => e[0])), Math.min(...ecken.map((e) => e[1])), Math.max(...ecken.map((e) => e[0])), Math.max(...ecken.map((e) => e[1])));
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      if (w >= 60 && w <= 420 && h <= 2.5) out.push({ ...b, art: "vektor" });
    }
  }
  // Doppelte (z. B. Rand + Füllung) zusammenfassen
  const eindeutig: Linie[] = [];
  for (const l of out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    if (!eindeutig.some((e) => Math.abs(e.y0 - l.y0) < 2 && Math.abs(e.x0 - l.x0) < 4 && Math.abs(e.x1 - l.x1) < 4)) eindeutig.push(l);
  }
  return eindeutig;
}

const ueberlappX = (a: Box, b: Box) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);

function feldUeber(l: Box, seiteB: number, seiteH: number) {
  const breite = l.x1 - l.x0;
  const w = breite >= 100 && breite <= 260 ? breite : FELD_BREITE;
  const x = Math.min(Math.max(4, l.x0), seiteB - w - 4);
  const y = Math.min(Math.max(4, l.y0 - FELD_HOEHE + 1), seiteH - FELD_HOEHE - 4);
  return { x: r1(x), y: r1(y), w: r1(w), h: FELD_HOEHE };
}

function kontextUm(zeilen: Zeile[], y: number, ohne?: Zeile): string {
  const nah = zeilen.filter((z) => z !== ohne && z.y1 >= y - 70 && z.y0 <= y + 40).map((z) => z.text.trim()).filter(Boolean);
  return nah.join(" | ").replace(/\s+/g, " ").slice(0, 220);
}

function textAuszug(zeilen: Zeile[], max: number): string {
  const t = zeilen.map((z) => z.text.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  if (t.length <= max) return t;
  // Bei langen Seiten Anfang und Ende zeigen (Unterschriften stehen meist unten)
  const kopf = Math.floor(max * 0.3);
  return `${t.slice(0, kopf)}\n[…]\n${t.slice(t.length - (max - kopf))}`;
}

/** Analysiert ein PDF und schlägt Unterschriftsfelder vor. */
export async function unterschriftsstellenErkennen(bytes: Uint8Array): Promise<Analyse> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  // deno-lint-ignore no-explicit-any
  const OPS = ((await getResolvedPDFJS()) as any).OPS;
  const seitenzahl = pdf.numPages;
  const seiten: Analyse["seiten"] = [];
  const vorschlaege: Vorschlag[] = [];
  const ortDatum: OrtDatum[] = [];
  const maxSeitenText = seitenzahl > 20 ? 250 : 600;

  for (let i = 1; i <= seitenzahl; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const B = vp.width, H = vp.height;
    const zeilen = zeilenBilden((await page.getTextContent()).items, vp);
    seiten.push({ seite: i, breite: r1(B), hoehe: r1(H), textauszug: textAuszug(zeilen, i === seitenzahl ? 2500 : maxSeitenText) });

    let linien: Linie[] = unterstriche(zeilen);
    // Vektorlinien nur auf Seiten mit Unterschrifts-Hinweisen im Text lesen (Operatorliste kostet bei
    // Scans/Bildern viel Rechenzeit; Seiten ohne Text haben ohnehin keine Beschriftung)
    const signale = zeilen.some((z) => STARK.test(z.text) || ORT_DATUM.test(z.text) || /,\s*den\b/i.test(z.text));
    if ((signale || (i === seitenzahl && zeilen.length > 0)) && bytes.byteLength <= 25 * 1024 * 1024) try {
      const vektor = await vektorLinien(page, vp, OPS);
      // Tabellenraster (viele gleich lange Linien übereinander) nicht als Unterschriftslinie werten
      const raster = (l: Linie) => vektor.filter((v) => Math.abs(v.x0 - l.x0) < 3 && Math.abs(v.x1 - l.x1) < 3).length >= 4;
      linien = linien.concat(vektor.filter((v) => !raster(v)));
    } catch (e) {
      console.warn("[felderkennung] Linien nicht lesbar:", e instanceof Error ? e.message : e);
    }

    const benutzt = new Set<Zeile>();
    const seitenFunde: Vorschlag[] = [];
    // Reine Rollen-Beschriftungen („Auftraggeber“, „Hausverwaltung“) nur in einem Unterschriftsumfeld
    // werten (Unterschrift/Ort, Datum/„…, den ____“ in der Nähe) – sonst z. B. Vertragsparteien im Kopf
    const umfeld = (y: number) => zeilen.some((z) => Math.abs(z.y0 - y) <= 150 &&
      ((STARK.test(z.text) && !UEBERSCHRIFT.test(z.text)) || ORT_DATUM.test(z.text) || /,\s*den\b/i.test(z.text)));
    for (const l of linien) {
      // Zeile mit dem Unterstrich: Text links davon („Unterschrift: ____“, „Pfronten, den ____“)
      const eigene = l.zeile;
      const links = (l.davor ?? (eigene ? eigene.teile.filter((t) => t.box.x1 <= l.x0 + 2).map((t) => t.str).join(" ") : ""))
        .replace(UNTERSTRICH, " ").replace(/\s+/g, " ").trim();
      if (links && (ORT_DATUM.test(links) || /\bden\s*$/i.test(links) || /^ort\b/i.test(links))) {
        ortDatum.push({ seite: i, x: r1(l.x0), y: r1(l.y0), text: (eigene?.text ?? links).replace(/\s+/g, " ").trim().slice(0, 120) });
        continue;
      }
      // Beschriftung direkt unter der Linie (bis 28 pt) oder knapp darüber in derselben Spalte
      const darunter = zeilen.filter((z) => z !== eigene && z.y0 >= l.y0 - 3 && z.y0 <= l.y1 + 28 && ueberlappX(z, l) > 10);
      const passend = darunter.find((z) => !HAT_UNTERSTRICH.test(z.text) && !UEBERSCHRIFT.test(z.text) &&
        (STARK.test(z.text) || (z.text.length <= 70 && ROLLE.test(z.text) && umfeld(l.y0)) || ORT_DATUM.test(z.text)));
      if (passend && ORT_DATUM.test(passend.text) && !STARK.test(passend.text)) {
        benutzt.add(passend);
        const teil = passend.teile.filter((t) => ueberlappX(t.box, l) > 0).map((t) => t.str).join(" ").trim();
        ortDatum.push({ seite: i, x: r1(l.x0), y: r1(l.y0), text: (teil || passend.text).replace(/\s+/g, " ").trim().slice(0, 120) });
        continue;
      }
      // Beschriftungszeile kann mehrere Spalten enthalten – den Teil unter der Linie nehmen
      const beschr = passend
        ? (passend.teile.filter((t) => ueberlappX(t.box, l) > 0).map((t) => t.str).join(" ").trim() || passend.text.trim())
        : links && (STARK.test(links) || (links.length <= 60 && ROLLE.test(links) && umfeld(l.y0))) ? links : "";
      if (passend) benutzt.add(passend);
      if (!beschr) continue; // unbeschriftete Linien (z. B. „Name: ____“) nur als Notlösung (unten)
      seitenFunde.push({
        seite: i,
        ...feldUeber(l, B, H),
        beschriftung: beschr.replace(/\s+/g, " ").slice(0, 120) || "(Linie ohne Beschriftung)",
        kontext: kontextUm(zeilen, l.y0, passend),
        quelle: passend || l.art === "vektor" ? "linie+beschriftung" : "unterstrich",
        sicherheit: STARK.test(beschr) || passend ? "hoch" : "mittel",
      });
    }

    // Beschriftungen ohne Linie („Unterschrift Auftraggeber“, „(Unterschrift)“, „Versammlungsleiter“)
    for (const z of zeilen) {
      if (benutzt.has(z) || z.text.length > 80) continue;
      if (!STARK.test(z.text) || UEBERSCHRIFT.test(z.text) || HAT_UNTERSTRICH.test(z.text)) continue;
      // Nur reine Beschriftungszeilen: andere Textteile (z. B. „Versammlungsleitung  Max Muster“) → Angabe, kein Feld
      if (z.teile.some((t) => t.str.trim() && !STARK.test(t.str) && !ORT_DATUM.test(t.str))) continue;
      if (seitenFunde.some((f) => z.y0 >= f.y + f.h - 4 && z.y0 <= f.y + f.h + 30 && ueberlappX(z, { x0: f.x, x1: f.x + f.w, y0: 0, y1: 0 }) > 0)) continue;
      // Teile der Zeile mit Schlüsselwort einzeln (mehrspaltige Unterschriftszeilen)
      const spalten = z.teile.filter((t) => BESCHRIFTUNG.test(t.str) && t.str.trim().length <= 50 && !/:\s*[^\s)]/.test(t.str) && !/[.!?;]\s*$/.test(t.str));
      for (const t of spalten) {
        const mitDoppelpunkt = /:\s*$/.test(t.str.trim());
        const ziel = mitDoppelpunkt
          // „Unterschrift:“ → Feld rechts daneben
          ? { x: r1(Math.min(t.box.x1 + 6, B - FELD_BREITE - 4)), y: r1(Math.max(4, t.box.y1 - FELD_HOEHE + 4)), w: FELD_BREITE, h: FELD_HOEHE }
          // sonst Feld über der Beschriftung
          : feldUeber({ x0: t.box.x0, x1: t.box.x0 + FELD_BREITE, y0: t.box.y0 - 2, y1: t.box.y0 }, B, H);
        seitenFunde.push({
          seite: i,
          ...ziel,
          beschriftung: t.str.replace(/\s+/g, " ").trim().slice(0, 120),
          kontext: kontextUm(zeilen, t.box.y0, z),
          quelle: "beschriftung",
          sicherheit: "mittel",
        });
      }
    }

    // Überlappende Vorschläge zusammenfassen (der sicherere gewinnt)
    const rang = { hoch: 3, mittel: 2, niedrig: 1 };
    for (const f of seitenFunde.sort((a, b) => rang[b.sicherheit] - rang[a.sicherheit])) {
      const doppelt = vorschlaege.some((v) => v.seite === f.seite &&
        Math.min(v.x + v.w, f.x + f.w) - Math.max(v.x, f.x) > Math.min(v.w, f.w) * 0.5 &&
        Math.min(v.y + v.h, f.y + f.h) - Math.max(v.y, f.y) > Math.min(v.h, f.h) * 0.5);
      if (!doppelt) vorschlaege.push(f);
    }

    // Notlösung für die letzte Seite: unbeschriftete Linien, wenn sonst nichts gefunden wurde
    if (i === seitenzahl && !vorschlaege.length) {
      for (const l of linien.filter((l) => l.y0 > H * 0.4 && !(l.davor && /:\s*$/.test(l.davor.trim()))).slice(-4)) {
        vorschlaege.push({
          seite: i, ...feldUeber(l, B, H), beschriftung: "(Linie ohne Beschriftung)",
          kontext: kontextUm(zeilen, l.y0), quelle: "linie", sicherheit: "niedrig",
        });
      }
    }
  }
  // deno-lint-ignore no-explicit-any
  try { await (pdf as any).destroy?.(); } catch { /* egal */ }

  vorschlaege.sort((a, b) => a.seite - b.seite || a.y - b.y || a.x - b.x);
  const out: Analyse = { seitenzahl, seiten, vorschlaege: vorschlaege.slice(0, 40), ort_datum_stellen: ortDatum.slice(0, 20) };
  if (!vorschlaege.length) {
    const letzte = seiten[seiten.length - 1];
    const textlos = seiten.every((s) => !s.textauszug.trim());
    out.hinweis = (textlos
      ? "Das PDF enthält keinen auslesbaren Text (vermutlich ein Scan) – Unterschriftsstellen konnten nicht erkannt werden. "
      : "Keine typische Unterschriftsstelle gefunden. ") +
      `Vorschlag: letzte Seite unten rechts, z. B. {seite: ${letzte.seite}, x: ${r1(letzte.breite - FELD_BREITE - 60)}, y: ${r1(letzte.hoehe - FELD_HOEHE - 110)}, w: ${FELD_BREITE}, h: ${FELD_HOEHE}} – oder ohne Felder senden (dann wird ein Prüfblatt angehängt).`;
  }
  return out;
}

// ================================================================ Ausfüllfelder
//
// (1) Unsichtbare Anker aus unseren Vorlagen (rgi-render-offer, _shared/vertrag-ausfuellfelder.ts):
//     „[[feld:<key>|typ=…|gruppe=…|option=…|beschriftung=…|ausfueller=gdw|pflicht=ja|abhaengig=<g>:<o>|max=…]]“
//     in 1 pt, weiß, 1 % Zeichenbreite. pdf.js zerlegt solchen Text in viele Stücke und liest Leerzeichen
//     unzuverlässig → Stücke einer Grundlinie zusammensetzen, alle Leerzeichen entfernen („_“ = Leerzeichen).
//     Die Lage kommt aus dem sichtbaren Inhalt: ☐ davor (Ankreuz/Auswahl), Unterstrich-Linie direkt
//     links (Datum/Text), Unterschriftslinie über der Beschriftung (Unterschrift).
// (2) Fremde PDFs: ☐/□ und „Datum ___“, „vom ___“, „TOP ___“ als Vorschlag.

export type ErkanntTyp = "ankreuz" | "auswahl" | "datum" | "text" | "unterschrift";

export interface ErkanntesFeld {
  feld_key: string;
  typ: ErkanntTyp;
  page: number; // 0-basiert (wie placements)
  seite: number; // 1-basiert
  x: number;
  y: number;
  w: number;
  h: number;
  beschriftung: string;
  gruppe?: string;
  option?: string;
  /** „gdw“, „rgi“ … (Rolle des Ausfüllers) – null = erster externer Unterzeichner */
  ausfueller_rolle: string | null;
  pflicht: boolean;
  abhaengig_von?: { feld_key: string } | { gruppe: string; option: string };
  max_laenge?: number;
  quelle: "vorlage" | "vorschlag";
  anker?: { page: number; x: number; y: number; w: number; h: number };
}

export interface FelderErgebnis {
  /** true = Dokument stammt aus unserer Vorlage (Anker gefunden) → Felder direkt übernehmen */
  vorlage: boolean;
  seitenzahl: number;
  felder: ErkanntesFeld[];
  vorschlaege: ErkanntesFeld[];
}

type Stueck = { str: string; box: Box; fs: number };
const KAESTCHEN = /[☐☒□■❑❒]/;

// deno-lint-ignore no-explicit-any
function stueckeLesen(items: any[], vp: any): Stueck[] {
  const out: Stueck[] = [];
  for (const it of items) {
    const str = String(it?.str ?? "");
    if (!str || !Array.isArray(it.transform)) continue;
    const [a, b, , , e, f] = it.transform;
    const fs = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
    const len = it.width || str.length * fs * 0.5;
    const n = Math.hypot(a, b) || 1;
    const ux = a / n, uy = b / n;
    const xs = [e, e + ux * len, e - uy * fs, e + ux * len - uy * fs];
    const ys = [f, f + uy * len, f + ux * fs, f + uy * len + ux * fs];
    out.push({ str, fs, box: ansichtsBox(vp, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)) });
  }
  return out;
}

/** „k=v|k=v“ eines Ankers lesen. */
function ankerWerte(innen: string): { key: string; w: Record<string, string> } | null {
  const teile = innen.split("|");
  const kopf = /^feld:([A-Za-z0-9_.=-]+)$/.exec(teile[0]);
  if (!kopf) return null;
  const w: Record<string, string> = {};
  for (const t of teile.slice(1)) {
    const i = t.indexOf("=");
    if (i > 0) w[t.slice(0, i).toLowerCase()] = t.slice(i + 1);
  }
  let key = kopf[1];
  // Kurzform „feld:<name>=<option>“ (Auswahl)
  if (key.includes("=")) {
    const [n, o] = key.split("=");
    w.option = w.option || o;
    w.gruppe = w.gruppe || n;
    w.typ = w.typ || "auswahl";
    key = `${w.gruppe}_${o}`;
  }
  return { key: key.toLowerCase(), w };
}

const ja = (v?: string) => /^(ja|true|1|yes)$/i.test(v ?? "");

/** Anker einer Seite: Stücke (≤ 1,5 pt) je Grundlinie zusammensetzen und auslesen. */
function ankerFinden(stuecke: Stueck[]) {
  const klein = stuecke.filter((s) => s.fs <= 1.5).sort((a, b) => a.box.y1 - b.box.y1 || a.box.x0 - b.box.x0);
  const linien: Stueck[][] = [];
  for (const s of klein) {
    const l = linien.find((l) => Math.abs(l[0].box.y1 - s.box.y1) < 0.6);
    if (l) l.push(s);
    else linien.push([s]);
  }
  const out: { key: string; w: Record<string, string>; x0: number; x1: number; grund: number }[] = [];
  for (const l of linien) {
    l.sort((a, b) => a.box.x0 - b.box.x0);
    let text = "";
    const zuStueck: number[] = [];
    l.forEach((s, i) => {
      for (const ch of s.str.replace(/\s+/g, "")) {
        text += ch;
        zuStueck.push(i);
      }
    });
    const re = /\[\[(feld:[^\]]*)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const a = ankerWerte(m[1]);
      if (!a) continue;
      const von = l[zuStueck[m.index]], bis = l[zuStueck[m.index + m[0].length - 1]];
      out.push({ ...a, x0: von.box.x0, x1: Math.max(bis.box.x1, von.box.x0 + 0.5), grund: von.box.y1 });
    }
  }
  return out;
}

/** Unterstrich-Läufe (≥ 4 „_“) mit Lage; `davor` = Text links davon im selben Stück. */
function unterstrichLaeufe(stuecke: Stueck[]) {
  const out: { x0: number; x1: number; grund: number; fs: number; davor: string; stueck: Stueck }[] = [];
  for (const s of stuecke) {
    if (s.fs <= 1.5) continue;
    const re = /_{4,}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s.str))) {
      const b = s.box.x1 - s.box.x0;
      out.push({
        x0: s.box.x0 + (m.index / s.str.length) * b,
        x1: s.box.x0 + ((m.index + m[0].length) / s.str.length) * b,
        grund: s.box.y1,
        fs: s.fs,
        davor: s.str.slice(0, m.index),
        stueck: s,
      });
    }
  }
  return out;
}

/** Kästchen-Zeichen mit Lage. */
function kaestchen(stuecke: Stueck[]) {
  const out: { x: number; grund: number; fs: number; zeichen: string; stueck: Stueck; idx: number }[] = [];
  for (const s of stuecke) {
    if (s.fs <= 1.5) continue;
    const zeichen = [...s.str];
    zeichen.forEach((ch, i) => {
      if (!KAESTCHEN.test(ch)) return;
      const b = s.box.x1 - s.box.x0;
      out.push({ x: s.box.x0 + (i / zeichen.length) * b, grund: s.box.y1, fs: s.fs, zeichen: ch, stueck: s, idx: i });
    });
  }
  return out;
}

/** Feld über dem sichtbaren Kästchen (Glyphe ☐: etwa 0,8 × Schriftgröße, Unterkante knapp über der Grundlinie). */
function kaestchenRechteck(k: { x: number; grund: number; fs: number }) {
  const s = k.fs * 0.78;
  return { x: r1(k.x + k.fs * 0.07), y: r1(k.grund - k.fs * 0.8), w: r1(s), h: r1(s) };
}

/** Feld über einer Unterstrich-Linie (Text sitzt auf der Linie). */
function linienRechteck(l: { x0: number; x1: number; grund: number; fs: number }) {
  return { x: r1(l.x0), y: r1(l.grund - l.fs * 1.05), w: r1(Math.max(20, l.x1 - l.x0)), h: r1(l.fs * 1.25) };
}

/** Text rechts eines Kästchens in derselben Zeile (Beschriftung für Vorschläge). */
function textRechts(zeilen: Zeile[], k: { x: number; grund: number }): string {
  const z = zeilen.find((z) => Math.abs(z.y1 - k.grund) <= 2.5);
  if (!z) return "";
  return z.teile.filter((t) => t.box.x0 >= k.x + 2).map((t) => t.str).join(" ")
    .replace(/^[☐☒□■❑❒\s]+/, "").replace(/_{3,}/g, " ").replace(/\[\[.*$/, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Erkennt Ausfüllfelder: Vorlagen-Anker (fertige Felder) bzw. Vorschläge in fremden PDFs. */
export async function ausfuellfelderErkennen(bytes: Uint8Array): Promise<FelderErgebnis> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  // deno-lint-ignore no-explicit-any
  const OPS = ((await getResolvedPDFJS()) as any).OPS;
  const felder: ErkanntesFeld[] = [];
  const vorschlaege: ErkanntesFeld[] = [];
  const seitenzahl = pdf.numPages;

  for (let i = 1; i <= seitenzahl; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const items = (await page.getTextContent()).items;
    const stuecke = stueckeLesen(items, vp);
    const anker = ankerFinden(stuecke);
    const striche = unterstrichLaeufe(stuecke);
    const boxen = kaestchen(stuecke);
    const p0 = i - 1;

    if (anker.length) {
      let vektor: Linie[] | null = null;
      for (const a of anker) {
        const typ = (a.w.typ || "").toLowerCase() as ErkanntTyp;
        if (!["ankreuz", "auswahl", "datum", "text", "unterschrift"].includes(typ)) continue;
        const beschriftung = (a.w.beschriftung || "").replace(/_/g, " ").trim();
        const ankerBox = { page: p0, x: r1(a.x0 - 0.5), y: r1(a.grund - 1.5), w: r1(a.x1 - a.x0 + 1.5), h: 2 };
        let lage: { x: number; y: number; w: number; h: number };
        if (typ === "ankreuz" || typ === "auswahl") {
          // nächstes Kästchen davor (gleiche Zeile links oder darüber)
          const k = boxen.filter((b) => b.grund <= a.grund + 2 && b.grund >= a.grund - 80 && (b.grund < a.grund - 2 || b.x <= a.x0 + 2))
            .sort((p, q) => q.grund - p.grund || Math.abs(a.x0 - p.x) - Math.abs(a.x0 - q.x))[0];
          lage = k ? kaestchenRechteck(k) : { x: r1(a.x0), y: r1(a.grund - 10), w: 10, h: 10 };
        } else if (typ === "datum" || typ === "text") {
          const l = striche.filter((s) => Math.abs(s.grund - a.grund) < 1.5 && s.x1 <= a.x0 + 3)
            .sort((p, q) => (a.x0 - p.x1) - (a.x0 - q.x1))[0];
          lage = l ? linienRechteck(l) : { x: r1(a.x0), y: r1(a.grund - 12), w: typ === "datum" ? 80 : 160, h: 14 };
        } else {
          // Unterschrift: Linie über der Beschriftung (Zeile des Ankers)
          if (!vektor) {
            try {
              vektor = await vektorLinien(page, vp, OPS);
            } catch {
              vektor = [];
            }
          }
          const label = stuecke.filter((s) => s.fs > 1.5 && Math.abs(s.box.y1 - a.grund) < 1.5 && s.box.x1 <= a.x0 + 2)
            .sort((p, q) => q.box.x1 - p.box.x1)[0];
          const lx0 = label?.box.x0 ?? a.x0 - 80;
          const linie = vektor.filter((v) => v.y0 < a.grund - 4 && v.y0 > a.grund - 45 && v.x0 <= lx0 + 4 && v.x1 >= lx0 + 20)
            .sort((p, q) => q.y0 - p.y0)[0];
          lage = linie ? feldUeber(linie, vp.width, vp.height) : feldUeber({ x0: lx0, x1: lx0 + FELD_BREITE, y0: a.grund - 14, y1: a.grund - 13 }, vp.width, vp.height);
          // Nicht über Text darüber ragen (z. B. „Ort, Datum“ knapp über der Linie)
          const unten = lage.y + lage.h;
          const darueber = stuecke.filter((s) => s.fs > 1.5 && s.box.y1 > lage.y && s.box.y1 < unten - 8 &&
            Math.min(s.box.x1, lage.x + lage.w) - Math.max(s.box.x0, lage.x) > 0);
          if (darueber.length) {
            const oben = Math.max(...darueber.map((s) => s.box.y1)) + 2;
            if (unten - oben >= 20) lage = { ...lage, y: r1(oben), h: r1(unten - oben) };
          }
        }
        const abh = a.w.abhaengig ? a.w.abhaengig.split(":") : null;
        const ausf = (a.w.ausfueller || "").toLowerCase() || null;
        felder.push({
          feld_key: a.key,
          typ,
          page: p0,
          seite: i,
          ...lage,
          beschriftung: beschriftung || a.key,
          ...(typ === "auswahl" ? { gruppe: (a.w.gruppe || a.key).toLowerCase(), option: (a.w.option || a.key).toLowerCase() } : {}),
          ausfueller_rolle: ausf,
          pflicht: ja(a.w.pflicht),
          ...(abh ? { abhaengig_von: abh.length === 2 ? { gruppe: abh[0].toLowerCase(), option: abh[1].toLowerCase() } : { feld_key: abh[0].toLowerCase() } } : {}),
          ...(typ === "text" && Number(a.w.max) > 0 ? { max_laenge: Math.min(500, Number(a.w.max)) } : {}),
          quelle: "vorlage",
          anker: ankerBox,
        });
      }
      continue;
    }

    // ---- Vorschläge für fremde PDFs
    const zeilen = zeilenBilden(items, vp);
    let n = vorschlaege.length;
    for (const k of boxen) {
      if (k.zeichen === "☒" || k.zeichen === "■") continue; // bereits angekreuzt
      n++;
      vorschlaege.push({
        feld_key: `ankreuz_${n}`, typ: "ankreuz", page: p0, seite: i, ...kaestchenRechteck(k),
        beschriftung: textRechts(zeilen, k) || "Ankreuzfeld", ausfueller_rolle: null, pflicht: false, quelle: "vorschlag",
      });
    }
    for (const l of striche) {
      const z = zeilen.find((z) => Math.abs(z.y1 - l.grund) <= 2.5);
      const links = [...(z?.teile ?? []).filter((t) => t.box.x1 <= l.x0 + 1 && t !== l.stueck).map((t) => t.str), l.davor].join(" ")
        .replace(/_{3,}/g, " ").replace(/\s+/g, " ").trim();
      let typ: "datum" | "text" | null = null;
      let beschriftung = "";
      if (/\bdatum\s*:?\s*$/i.test(links) && !ORT_DATUM.test(links) && !/\bort\b/i.test(links)) {
        typ = "datum";
        beschriftung = "Datum";
      } else if (/\bvom\s*:?\s*$/i.test(links)) {
        typ = "datum";
        beschriftung = links.replace(/\s*vom\s*:?\s*$/i, "").split(/[.;:]/).pop()!.trim().slice(-60) || "Datum";
        beschriftung = `${beschriftung} vom`.trim();
      } else if (/\btop\s*:?\s*$/i.test(links)) {
        typ = "text";
        beschriftung = "TOP";
      }
      if (!typ) continue;
      n++;
      vorschlaege.push({
        feld_key: `${typ}_${n}`, typ, page: p0, seite: i, ...linienRechteck(l), beschriftung,
        ausfueller_rolle: null, pflicht: false, ...(typ === "text" ? { max_laenge: 40 } : {}), quelle: "vorschlag",
      });
    }
  }
  // deno-lint-ignore no-explicit-any
  try { await (pdf as any).destroy?.(); } catch { /* egal */ }
  // Aus unserer Vorlage: nur die Anker zählen (z. B. das Muster-Widerrufsformular bleibt leer)
  const vorlage = felder.length > 0;
  return { vorlage, seitenzahl, felder, vorschlaege: vorlage ? [] : vorschlaege.slice(0, 40) };
}

/** Seitengrößen in Ansichtskoordinaten (wie placements; Drehung und CropBox berücksichtigt), Seiten 1-basiert. */
export async function seitenGroessen(bytes: Uint8Array): Promise<{ seite: number; breite: number; hoehe: number }[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
    out.push({ seite: i, breite: r1(vp.width), hoehe: r1(vp.height) });
  }
  // deno-lint-ignore no-explicit-any
  try { await (pdf as any).destroy?.(); } catch { /* egal */ }
  return out;
}
