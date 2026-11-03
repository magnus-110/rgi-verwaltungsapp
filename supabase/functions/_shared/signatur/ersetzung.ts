// Elektronische Unterschrift – „Ersetzungen“: geänderte vorbelegte Angaben (Feldtyp „vorbelegt“) und
// Korrekturen per Antippen (sign_request_ergaenzungen mit zeilen). Gemeinsam genutzt von
//  - der Unterschriftsseite (Live-Vorschau als SVG, src/components/signatur/public) und
//  - dem PDF (pdf.ts → ersetzungenZeichnen),
// damit Vorschau und fertiges PDF exakt gleich aussehen. Reines TypeScript ohne Abhängigkeiten.
//
// Darstellung: der ALTE Text wird exakt durchgestrichen (Linie auf halber x-Höhe der Glyphen über die
// genaue Textbreite), der NEUE Text steht dunkelblau
//   1. direkt dahinter in derselben Zeile (gleiche Grundlinie), wenn bis zum Seitenrand bzw. zur nächsten
//      Spalte Platz ist, sonst
//   2. kleiner direkt darüber, wenn über der Zeile Platz ist, sonst
//   3. als Fußnote: Ziffer ① hinter der Stelle und unten auf der Seite „① Name: … (geändert von …)“.
// Koordinaten: PDF-Punkte der angezeigten Seite, Ursprung oben links, y nach unten (wie placements).

/** Eine Textzeile des Originals (aus der Textebene des PDFs): Kasten, Grundlinie, Schriftgröße. */
export interface TextZeile {
  x: number;
  y: number;
  w: number;
  h: number;
  /** y der Grundlinie */
  basis: number;
  /** Schriftgröße in pt */
  groesse: number;
}

/** Freier Platz rund um die Stelle: rechts bis `bis` (x), oben bis `oben` (y). `scan` = ohne Textebene. */
export interface Frei {
  bis: number;
  oben: number;
  scan?: boolean;
}

export const BLAU = "#1F3A93";

// Breiten der Helvetica (pdf-lib StandardFonts.Helvetica, WinAnsi, 1/1000 em) – ohne Unterschneidung,
// denn pdf-lib zeichnet ohne Kerning.
const HELV_32_255 = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const HELV_EXTRA: Record<number, number> = {338:1000,339:944,352:667,353:500,376:500,381:611,382:500,402:556,710:333,732:333,8211:556,8212:1000,8216:222,8217:222,8218:222,8220:333,8221:333,8222:333,8224:556,8225:556,8226:350,8230:1000,8240:1000,8249:333,8250:333,8364:556,8482:1000};

/** Kann die Standardschrift (WinAnsi) das Zeichen darstellen? */
export function darstellbar(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 32 && cp <= 255) return HELV_32_255[cp - 32] > 0;
  return cp in HELV_EXTRA;
}

/** Text auf darstellbare Zeichen bringen (schmale Leerzeichen → Leerzeichen, sonst „?“). */
export function helvSicher(t: string): string {
  let out = "";
  for (const ch of String(t ?? "").replace(/[\r\n\t]+/g, " ")) {
    if (darstellbar(ch)) out += ch;
    else out += /[ -​  ]/.test(ch) ? " " : "?";
  }
  return out;
}

/** Breite des Textes in Helvetica bei `size` pt (wie pdf-lib zeichnet). */
export function helvBreite(t: string, size: number): number {
  let s = 0;
  for (const ch of helvSicher(t)) {
    const cp = ch.codePointAt(0)!;
    s += cp <= 255 ? HELV_32_255[cp - 32] : HELV_EXTRA[cp] ?? 556;
  }
  return (s / 1000) * size;
}

/** y der Durchstreichung: halbe x-Höhe über der Grundlinie (x-Höhe ≈ 0,52 em). */
export const strichY = (z: TextZeile) => z.basis - 0.26 * z.groesse;
/** Strichstärke passend zur Schrift. */
export const strichDicke = (z: TextZeile) => Math.max(0.6, Math.min(1.2, z.groesse * 0.065));

export type Darstellung = "dahinter" | "darueber" | "fussnote";

export interface ErsetzungLayout {
  art: Darstellung;
  /** Linien der Durchstreichung (je Originalzeile) */
  striche: { x1: number; x2: number; y: number; dicke: number }[];
  /** neuer Text (dahinter/darüber): Startpunkt auf der Grundlinie */
  text: { x: number; basis: number; size: number; inhalt: string; hintergrund: boolean } | null;
  /** Fußnotenzeichen hinter der Stelle (nur Fußnote) */
  marke: { x: number; y: number; r: number; nr: number } | null;
  /** Kasten des neuen Textes bzw. der Marke (für Anzeige/Speicherung) */
  kasten: { x: number; y: number; w: number; h: number };
}

export interface Ersetzung {
  page: number;
  zeilen: TextZeile[];
  frei: Frei;
  /** alter Text (bei Scans evtl. leer) */
  alt: string;
  neu: string;
  /** Beschriftung (vorbelegte Angabe), z. B. „Name“; bei Korrekturen leer */
  label?: string;
}

const RAND_SEITE = 14;

/** Zeichenkette für Fußnoten/Listen: „Name: neu (geändert von alt)“ bzw. „Statt „alt“: neu“. */
export function fussnotenText(e: Pick<Ersetzung, "alt" | "neu" | "label">): string {
  const alt = e.alt.trim();
  if (e.label) return `${e.label}: ${e.neu}${alt ? ` (geändert von ${alt})` : ""}`;
  return alt ? `Statt „${alt}“: ${e.neu}` : `Korrektur: ${e.neu}`;
}

/**
 * Lage des neuen Textes berechnen. `seite` = Größe der angezeigten Seite, `nr` = Nummer der Fußnote,
 * falls eine nötig wird.
 */
export function ersetzungLayout(e: Pick<Ersetzung, "zeilen" | "frei" | "neu">, seite: { w: number; h: number }, nr: number): ErsetzungLayout {
  const zeilen = e.zeilen.length ? e.zeilen : [{ x: 0, y: 0, w: 1, h: 1, basis: 1, groesse: 10 }];
  const erste = zeilen[0];
  const letzte = zeilen[zeilen.length - 1];
  const striche = zeilen.map((z) => ({ x1: z.x, x2: z.x + z.w, y: strichY(z), dicke: strichDicke(z) }));
  const inhalt = helvSicher(e.neu.replace(/\s+/g, " ").trim());
  const hintergrund = !!e.frei.scan;
  const rechtsGrenze = Math.min(seite.w - RAND_SEITE, Math.max(e.frei.bis, letzte.x + letzte.w));
  const s = Math.max(6, Math.min(12, letzte.groesse));

  // 1. dahinter, gleiche Grundlinie
  const abstand = Math.max(2, s * 0.35);
  const x0 = letzte.x + letzte.w + abstand;
  const b0 = helvBreite(inhalt, s);
  if (x0 + b0 <= rechtsGrenze - 0.5) {
    return {
      art: "dahinter", striche, marke: null,
      text: { x: x0, basis: letzte.basis, size: s, inhalt, hintergrund },
      kasten: { x: x0, y: letzte.basis - 0.75 * s, w: b0, h: 0.96 * s },
    };
  }

  // 2. kleiner darüber (ab Beginn der ersten Zeile, bis zum Seitenrand), wenn über der Zeile Platz ist
  const grenzeOben = Math.max(0, e.frei.oben);
  const breiteOben = seite.w - RAND_SEITE - erste.x;
  const oberkante = Math.min(erste.y, erste.basis - 0.72 * erste.groesse); // Oberkante der Großbuchstaben
  for (let s2 = Math.min(9, Math.max(5, s * 0.8)); s2 >= 5; s2 -= 0.5) {
    const b2 = helvBreite(inhalt, s2);
    if (b2 > breiteOben) continue;
    const basis = oberkante - 0.4 - 0.21 * s2; // Unterlängen enden knapp über der Zeile
    if (basis - 0.75 * s2 < grenzeOben + 0.4) continue;
    return {
      art: "darueber", striche, marke: null,
      text: { x: erste.x, basis, size: s2, inhalt, hintergrund },
      kasten: { x: erste.x, y: basis - 0.75 * s2, w: b2, h: 0.96 * s2 },
    };
  }

  // 3. Fußnote
  const r = Math.max(2.6, Math.min(4.2, s * 0.36));
  const mx = Math.min(seite.w - 2 * r - 1, letzte.x + letzte.w + 1);
  const my = letzte.basis - 0.62 * s;
  return {
    art: "fussnote", striche, text: null,
    marke: { x: mx + r, y: my, r, nr },
    kasten: { x: mx, y: my - r, w: 2 * r, h: 2 * r },
  };
}

/** Zeilen einer Fußnote (Umbruch auf die Seitenbreite). */
function umbrechen(t: string, size: number, breite: number): string[] {
  const woerter = t.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let z = "";
  for (const w of woerter) {
    const probe = z ? `${z} ${w}` : w;
    if (helvBreite(probe, size) <= breite) z = probe;
    else {
      if (z) out.push(z);
      let rest = w;
      while (helvBreite(rest, size) > breite && rest.length > 1) {
        let n = rest.length;
        while (n > 1 && helvBreite(rest.slice(0, n), size) > breite) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      z = rest;
    }
  }
  if (z) out.push(z);
  return out.length ? out : [""];
}

export interface Fussnote {
  nr: number;
  zeilen: { x: number; basis: number; inhalt: string }[];
  size: number;
  /** Kreis der Nummer */
  marke: { x: number; y: number; r: number };
  kasten: { x: number; y: number; w: number; h: number };
}

/** Fußnoten unten auf der Seite (über der Fußzeile „Elektronisch unterschrieben …“). */
export function fussnotenLayout(liste: { nr: number; text: string }[], seite: { w: number; h: number }): Fussnote[] {
  if (!liste.length) return [];
  const size = 7.5;
  const zeile = 9.2;
  const links = 36;
  const einzug = 12;
  const breite = seite.w - 2 * links - einzug;
  const bloecke = liste.map((f) => ({ nr: f.nr, zeilen: umbrechen(helvSicher(f.text), size, breite) }));
  const gesamt = bloecke.reduce((a, b) => a + b.zeilen.length, 0);
  // letzte Grundlinie 22 pt über dem Seitenende (darunter steht die Fußzeile)
  let basis = seite.h - 22 - (gesamt - 1) * zeile;
  return bloecke.map((b) => {
    const start = basis;
    const zeilen = b.zeilen.map((inhalt, i) => ({ x: links + einzug, basis: start + i * zeile, inhalt }));
    basis += b.zeilen.length * zeile;
    const w = Math.max(...zeilen.map((z) => helvBreite(z.inhalt, size))) + einzug + 4;
    return {
      nr: b.nr, size, zeilen,
      marke: { x: links + 4, y: start - 0.36 * size, r: 3.6 },
      kasten: { x: links - 2, y: start - 0.8 * size - 1.5, w, h: b.zeilen.length * zeile + 2 },
    };
  });
}

/** Alle Ersetzungen einer Seite: Layouts (in Reihenfolge der Liste) + Fußnoten. */
export function seiteLayout(liste: Ersetzung[], seite: { w: number; h: number }): { layouts: ErsetzungLayout[]; fussnoten: Fussnote[] } {
  let nr = 0;
  const layouts: ErsetzungLayout[] = [];
  const noten: { nr: number; text: string }[] = [];
  for (const e of liste) {
    const l = ersetzungLayout(e, seite, nr + 1);
    if (l.art === "fussnote") {
      nr++;
      noten.push({ nr, text: fussnotenText(e) });
    }
    layouts.push(l);
  }
  return { layouts, fussnoten: fussnotenLayout(noten, seite) };
}

/** Feste Reihenfolge auf einer Seite: von oben nach unten, dann von links nach rechts. */
export function ersetzungenSortieren<T extends Pick<Ersetzung, "page" | "zeilen">>(l: T[]): T[] {
  return [...l].sort((a, b) => a.page - b.page || (a.zeilen[0]?.y ?? 0) - (b.zeilen[0]?.y ?? 0) || (a.zeilen[0]?.x ?? 0) - (b.zeilen[0]?.x ?? 0));
}

/** Zeile für Scans (ohne Textebene) aus einem markierten Rechteck: Durchstreichung genau mittig. */
export function zeileAusBereich(b: { x: number; y: number; w: number; h: number }): TextZeile {
  const groesse = Math.max(6, Math.min(12, b.h * 0.75));
  return { x: b.x, y: b.y, w: b.w, h: b.h, basis: b.y + b.h / 2 + 0.26 * groesse, groesse };
}

// ================================================================ Prüfung (Server)

const endlich = (...n: number[]) => n.every((v) => Number.isFinite(v));

/** Zeilen aus einer Eingabe prüfen (Lage auf der Seite, Größen). Wirft mit Meldung `name: …`. */
export function zeilenPruefen(roh: unknown, seite: { w: number; h: number }, name: string): TextZeile[] {
  if (!Array.isArray(roh) || !roh.length) throw new Error(`${name}: Die markierte Textstelle fehlt.`);
  if (roh.length > 12) throw new Error(`${name}: höchstens 12 Zeilen markieren.`);
  const T = 1;
  const r1 = (n: number) => Math.round(n * 100) / 100;
  return roh.map((z: unknown) => {
    const o = (z && typeof z === "object" ? z : {}) as Record<string, unknown>;
    const v = { x: Number(o.x), y: Number(o.y), w: Number(o.w), h: Number(o.h), basis: Number(o.basis), groesse: Number(o.groesse) };
    if (!endlich(v.x, v.y, v.w, v.h, v.basis, v.groesse)) throw new Error(`${name}: ungültige Lage.`);
    if (v.w < 0.5 || v.h < 1 || v.groesse < 2 || v.groesse > 72) throw new Error(`${name}: ungültige Größe.`);
    if (v.x < -T || v.y < -T || v.x + v.w > seite.w + T || v.y + v.h > seite.h + T) throw new Error(`${name} liegt nicht vollständig auf der Seite.`);
    if (v.basis < v.y - T || v.basis > v.y + v.h + v.groesse) throw new Error(`${name}: ungültige Grundlinie.`);
    return { x: r1(v.x), y: r1(v.y), w: r1(v.w), h: r1(v.h), basis: r1(v.basis), groesse: r1(v.groesse) };
  });
}

/** Freien Platz prüfen und auf sinnvolle Werte begrenzen. */
export function freiPruefen(roh: unknown, zeilen: TextZeile[], seite: { w: number; h: number }): Frei {
  const o = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
  const letzte = zeilen[zeilen.length - 1];
  const erste = zeilen[0];
  let bis = Number(o.bis);
  let oben = Number(o.oben);
  if (!Number.isFinite(bis)) bis = letzte.x + letzte.w;
  if (!Number.isFinite(oben)) oben = erste.y;
  bis = Math.min(seite.w, Math.max(letzte.x + letzte.w, bis));
  oben = Math.max(0, Math.min(erste.y, oben));
  return { bis: Math.round(bis * 100) / 100, oben: Math.round(oben * 100) / 100, ...(o.scan === true ? { scan: true } : {}) };
}

// ================================================================ IBAN

const IBAN_LAENGE: Record<string, number> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23,
  GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28,
  PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

export const ibanRoh = (v: string) => String(v ?? "").replace(/[\s-]+/g, "").toUpperCase();
export const ibanGruppiert = (v: string) => ibanRoh(v).replace(/(.{4})/g, "$1 ").trim();

/** IBAN prüfen: null = gültig, sonst Fehlermeldung (deutsch, einfach). */
export function ibanFehler(v: string): string | null {
  const i = ibanRoh(v);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$/.test(i)) return "Bitte eine vollständige IBAN eingeben (z. B. DE12 3456 …).";
  const soll = IBAN_LAENGE[i.slice(0, 2)];
  if (soll && i.length !== soll) return `Eine IBAN aus ${i.slice(0, 2) === "DE" ? "Deutschland" : i.slice(0, 2)} hat ${soll} Stellen – bitte prüfen.`;
  const umgestellt = i.slice(4) + i.slice(0, 4);
  let rest = 0;
  for (const ch of umgestellt) {
    const n = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of n) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1 ? null : "Die IBAN stimmt nicht (Prüfziffer falsch). Bitte noch einmal vergleichen.";
}

/** Ist das Feld ein IBAN-Feld? (Untertyp iban oder Beschriftung „IBAN“) */
export const istIbanFeld = (f: { typ: string; format?: string | null; beschriftung?: string | null }) =>
  f.typ === "text" && (f.format === "iban" || /\bIBAN\b/i.test(f.beschriftung ?? ""));
