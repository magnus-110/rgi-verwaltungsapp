// Graue Zeile unter einer elektronischen Unterschrift („Name · elektronisch unterschrieben am …“).
// Jedes Dokument sieht anders aus – deshalb richtet sich die Lage nicht nach dem Layout, sondern nach
// dem Unterschriftsfeld und dem, was im Dokument tatsächlich um das Feld herum steht:
//  1. Breite: nie breiter als das Feld (eine Zeile, sonst zwei: Name / „elektronisch unterschrieben …“,
//     notfalls kleinere Schrift) – läuft also nie in eine Nachbarspalte.
//  2. Lage: erste freie Lücke unter der Linie (Text und Linien des Dokuments, andere Unterschriftsfelder
//     und die Fußzeile werden umgangen), z. B. unter „Hausverwaltung“ statt darauf.
//  3. Kein Platz darunter: erste freie Lücke über dem Feld.
//  4. Sonst direkt unter der Linie (wie früher). Name und Zeit stehen zusätzlich im Nachweis.
// Rein rechnerisch (keine Abhängigkeiten) – gemeinsam für Endfassung (pdf.ts) und Vorschau (sign-public).
// Koordinaten: PDF-Punkte, Ursprung oben links der angezeigten Seite (wie placements).
import { helvBreite, helvSicher } from "./ersetzung.ts";

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Rechteck = { x: number; y: number; w: number; h: number };

export interface UnterzeileZeile {
  text: string;
  x: number;
  /** Grundlinie (oben-links-Koordinaten) */
  basis: number;
  groesse: number;
}

export const UNTERZEILE = {
  GROESSE: 6,
  MIN_GROESSE: 4.5,
  ZEILENABSTAND: 1.25, // × Schriftgröße
  OBERLAENGE: 0.75, // Anteil der Schriftgröße über der Grundlinie
  UNTERLAENGE: 0.22,
  ABSTAND: 1.5, // Mindestabstand zu Text/Linien
  SUCHE_UNTEN: 60, // so weit unter der Linie wird gesucht
  SUCHE_OBEN: 40,
  FUSS_FREI: 26, // unterster Seitenrand (Fußzeile „Elektronisch unterschrieben über …“)
} as const;

/** Text der Zeile(n) – der Datumsteil kommt fertig formatiert (basis.ts datumZeit). */
export function unterzeileTexte(name: string, zeit: string, ort?: string | null): { eine: string; name: string; rest: string } {
  const n = helvSicher(name.trim());
  const rest = helvSicher(ort ? `elektronisch unterschrieben in ${ort.trim()} am ${zeit}` : `elektronisch unterschrieben am ${zeit}`);
  return { eine: `${n} · ${rest}`, name: n, rest };
}

/** Kürzt einen Text mit „…“, bis er in die Breite passt. */
function kuerzen(t: string, size: number, max: number): string {
  if (helvBreite(t, size) <= max) return t;
  let s = t;
  while (s.length > 1 && helvBreite(`${s}…`, size) > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Zeilen und Schriftgröße so wählen, dass alles in die Feldbreite passt. */
function zeilenWaehlen(t: { eine: string; name: string; rest: string }, breite: number): { zeilen: string[]; groesse: number } {
  const U = UNTERZEILE;
  if (helvBreite(t.eine, U.GROESSE) <= breite) return { zeilen: [t.eine], groesse: U.GROESSE };
  for (let g = U.GROESSE; g >= U.MIN_GROESSE - 1e-6; g -= 0.25) {
    if (helvBreite(t.name, g) <= breite && helvBreite(t.rest, g) <= breite) return { zeilen: [t.name, t.rest], groesse: g };
  }
  const g = U.MIN_GROESSE;
  return { zeilen: [kuerzen(t.name, g, breite), kuerzen(t.rest, g, breite)], groesse: g };
}

const schneidet = (a: Box, b: Box, rand: number) =>
  a.x0 < b.x1 + rand && a.x1 > b.x0 - rand && a.y0 < b.y1 + rand && a.y1 > b.y0 - rand;

/**
 * Lage der grauen Zeile(n) für ein Unterschriftsfeld.
 * @param hindernisse Text- und Linienboxen der Seite (aus der Quelle), andere Unterschriftsfelder
 */
export function unterzeileLayout(
  feld: Rechteck,
  seite: { w: number; h: number } | null,
  hindernisse: Box[],
  texte: { eine: string; name: string; rest: string },
): UnterzeileZeile[] {
  const U = UNTERZEILE;
  const { zeilen, groesse } = zeilenWaehlen(texte, feld.w);
  const zeilenHoehe = groesse * U.ZEILENABSTAND;
  const blockH = (zeilen.length - 1) * zeilenHoehe + groesse * (U.OBERLAENGE + U.UNTERLAENGE);
  const blockW = Math.max(...zeilen.map((z) => helvBreite(z, groesse)));
  const x = feld.x;
  const linie = feld.y + feld.h;
  // Alles, was im Unterschriftsfeld selbst liegt (Platzhalter, Anker), zählt nicht
  const innen = (b: Box) => b.x0 >= feld.x - 1 && b.x1 <= feld.x + feld.w + 1 && b.y0 >= feld.y - 1 && b.y1 <= linie + 0.5;
  const fremd = hindernisse.filter((b) => !innen(b));
  const unten = seite ? seite.h - U.FUSS_FREI : Infinity;
  const frei = (oben: number) => {
    const box = { x0: x, y0: oben, x1: x + blockW, y1: oben + blockH };
    if (box.y0 < 2 || box.y1 > unten) return false;
    return !fremd.some((b) => schneidet(box, b, U.ABSTAND));
  };
  const setzen = (oben: number): UnterzeileZeile[] =>
    zeilen.map((text, i) => ({ text, x, basis: oben + groesse * U.OBERLAENGE + i * zeilenHoehe, groesse }));

  // 1) unter der Linie, erste freie Lücke
  for (let oben = linie + U.ABSTAND; oben <= linie + U.SUCHE_UNTEN; oben += 0.5) if (frei(oben)) return setzen(oben);
  // 2) über dem Feld
  for (let oben = feld.y - blockH - U.ABSTAND; oben >= feld.y - U.SUCHE_OBEN - blockH; oben -= 0.5) if (frei(oben)) return setzen(oben);
  // 3) wie früher direkt unter der Linie
  return setzen(linie + U.ABSTAND);
}
