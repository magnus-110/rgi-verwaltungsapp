// Elektronische Unterschrift – Ergänzungen und Korrekturen des Unterzeichners (Tabelle sign_request_ergaenzungen).
// Nur wenn RGI es je Unterzeichner freigibt (sign_request_signers.darf_ergaenzen). Gespeichert wird
// zusammen mit der Unterschrift (sign-public „sign“); im PDF dunkelblau eingesetzt (pdf.ts).
//  - ergaenzung: freier Text an einer Stelle der Seite (Textfeld x/y/w/h)
//  - korrektur:  durchgestrichener Bereich (bereich) + Ersatztext „Richtig ist: …“ (Textfeld x/y/w/h)
// Koordinaten wie placements: page 0-basiert, PDF-Punkte, Ursprung oben links der angezeigten Seite.
import { Fehler } from "./basis.ts";
import type { Db } from "./basis.ts";

export const MAX_ERGAENZUNGEN = 30;
export const ERGAENZUNG_MAX_ZEICHEN = 300;
export const ERGAENZUNG_MAX_ZEILEN = 12;

export type ErgaenzungArt = "ergaenzung" | "korrektur";
export interface Rechteck {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zeile aus sign_request_ergaenzungen. */
export interface Ergaenzung extends Rechteck {
  id: string;
  request_id: string;
  signer_id: string;
  art: ErgaenzungArt;
  position: number;
  page: number;
  bereich: Rechteck | null;
  text: string;
  erstellt_von: string;
  erstellt_am: string;
}

/** Geprüfte Eingabe (ohne IDs). */
export interface ErgaenzungEingabe extends Rechteck {
  art: ErgaenzungArt;
  page: number;
  bereich: Rechteck | null;
  text: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Text säubern: Steuerzeichen raus, Zeilenumbrüche behalten, höchstens eine Leerzeile am Stück. */
export function ergaenzungText(v: unknown): string {
  return String(v ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]+/g, " ")
    .split("\n")
    .map((z) => z.replace(/[ \t ]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Rechteck prüfen: endlich, Mindestgröße, vollständig auf der Seite (1 pt Toleranz). */
function rechteckPruefen(roh: unknown, seite: { w: number; h: number }, min: { w: number; h: number }, name: string): Rechteck {
  const o = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
  const z = { x: Number(o.x), y: Number(o.y), w: Number(o.w), h: Number(o.h) };
  if (![z.x, z.y, z.w, z.h].every(Number.isFinite)) throw new Fehler(400, `${name}: ungültige Lage.`);
  if (z.w < min.w || z.h < min.h) throw new Fehler(400, `${name} ist zu klein.`);
  const T = 1;
  if (z.x < -T || z.y < -T || z.x + z.w > seite.w + T || z.y + z.h > seite.h + T) {
    throw new Fehler(400, `${name} liegt nicht vollständig auf der Seite.`);
  }
  return { x: r1(Math.max(0, z.x)), y: r1(Math.max(0, z.y)), w: r1(Math.min(z.w, seite.w)), h: r1(Math.min(z.h, seite.h)) };
}

/**
 * Prüft die Ergänzungen eines Unterzeichners serverseitig: Art, Anzahl, Seite vorhanden, Lage innerhalb
 * der Seite, Mindestgröße, Text (Pflicht, Länge, Zeilen). `seiten` = Größe der angezeigten Seiten in pt.
 */
export function ergaenzungenPruefen(roh: unknown, seiten: { w: number; h: number }[]): ErgaenzungEingabe[] {
  if (roh == null) return [];
  if (!Array.isArray(roh)) throw new Fehler(400, "Die Ergänzungen sind ungültig.");
  if (roh.length > MAX_ERGAENZUNGEN) throw new Fehler(400, `Höchstens ${MAX_ERGAENZUNGEN} Ergänzungen je Dokument.`);
  return roh.map((e: unknown, i: number) => {
    const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const art = o.art === "korrektur" ? "korrektur" : o.art === "ergaenzung" ? "ergaenzung" : null;
    if (!art) throw new Fehler(400, `Ergänzung ${i + 1}: unbekannte Art.`);
    const name = art === "korrektur" ? `Korrektur ${i + 1}` : `Ergänzung ${i + 1}`;
    const page = Number(o.page);
    if (!Number.isInteger(page) || page < 0 || page >= seiten.length) throw new Fehler(400, `${name} liegt auf einer Seite, die es nicht gibt.`);
    const seite = seiten[page];
    const roherText = String(o.text ?? "");
    if (roherText.length > ERGAENZUNG_MAX_ZEICHEN * 2) throw new Fehler(400, `${name}: höchstens ${ERGAENZUNG_MAX_ZEICHEN} Zeichen.`);
    const text = ergaenzungText(roherText);
    if (!text) {
      throw new Fehler(400, art === "korrektur" ? `${name}: Bitte angeben, was richtig ist.` : `${name}: Bitte Text eingeben oder die Ergänzung löschen.`);
    }
    if (text.length > ERGAENZUNG_MAX_ZEICHEN) throw new Fehler(400, `${name}: höchstens ${ERGAENZUNG_MAX_ZEICHEN} Zeichen.`);
    if (text.split("\n").length > ERGAENZUNG_MAX_ZEILEN) throw new Fehler(400, `${name}: höchstens ${ERGAENZUNG_MAX_ZEILEN} Zeilen.`);
    const box = rechteckPruefen(o, seite, { w: 12, h: 8 }, art === "korrektur" ? `Der Text zu ${name}` : name);
    const bereich = art === "korrektur" ? rechteckPruefen(o.bereich, seite, { w: 4, h: 4 }, `Der markierte Bereich von ${name}`) : null;
    return { art, page, ...box, bereich, text };
  });
}

/** Ergänzungen eines Vorgangs laden (sortiert). */
export async function ergaenzungenLaden(db: Db, requestId: string): Promise<Ergaenzung[]> {
  const { data, error } = await db.from("sign_request_ergaenzungen").select("*").eq("request_id", requestId)
    .order("erstellt_am", { ascending: true }).order("position", { ascending: true });
  if (error) {
    console.error("[ergaenzungen] laden:", error.message);
    return [];
  }
  return (data ?? []).map((e: Ergaenzung) => ({ ...e, x: Number(e.x), y: Number(e.y), w: Number(e.w), h: Number(e.h) }));
}

/** „Seite 2 · Ergänzung: „…““ bzw. „Seite 1 · Korrektur: markierte Stelle ersetzt durch „…““ */
export function ergaenzungBeschreibung(e: Pick<ErgaenzungEingabe, "art" | "page" | "text">): string {
  const t = e.text.replace(/\s*\n\s*/g, " / ");
  return e.art === "korrektur"
    ? `Seite ${e.page + 1} · Korrektur: markierte Stelle ersetzt durch „${t}“`
    : `Seite ${e.page + 1} · Ergänzung: „${t}“`;
}

/** Text für Protokoll/Meldung: „hat 3 Angaben ergänzt/korrigiert“ */
export const angabenText = (n: number) => `${n} ${n === 1 ? "Angabe" : "Angaben"} ergänzt/korrigiert`;
