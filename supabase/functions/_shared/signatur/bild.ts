// Unterschriftsbilder für die Anzeige vorbereiten.
// Gezeichnete Unterschriften kommen von einer breiten Zeichenfläche und haben viel leeren Rand.
// Ohne Zuschnitt wird beim Einpassen ins Feld vor allem der Rand eingepasst – die Unterschrift
// selbst wirkt dann winzig. Gilt für die Endfassung (stempeln) und die Vorschau (sign-public).
// @ts-ignore – upng-js liefert zur Laufzeit nur den Default-Export (die Typen kennen ihn nicht)
import UPNG_ from "https://esm.sh/upng-js@2.1.0";
import { base64ZuBytes, bytesZuBase64 } from "./basis.ts";

/**
 * Lage der Unterschrift (in PDF-Punkten), gemeinsam für Endfassung und Vorschau:
 * - Bild unten bündig auf der Linie, links mit EINZUG pt Abstand zum Linienanfang, höchstens Feldbreite
 * - darf um UEBERSTAND × Feldhöhe nach oben über das Feld hinausragen (0 = nicht: sonst stößt sie
 *   links an Beschriftungen darüber wie „Ort, Datum“)
 * - graue Zeile „Name · elektronisch unterschrieben …“ mit Grundlinie ZEILE_ABSTAND pt unter der Linie,
 *   also unter der Beschriftung („Hausverwaltung“, „Vertreter der GdW“ …), nicht darauf
 */
export const UNTERSCHRIFT = { UEBERSTAND: 0, EINZUG: 6, ZEILE_ABSTAND: 17, ZEILE_GROESSE: 6 } as const;

// deno-lint-ignore no-explicit-any
const UPNG = UPNG_ as any;

const cache = new Map<string, string>();

/** Schneidet leeren (durchsichtigen oder weißen) Rand ab. Bei Fehlern bleibt das Bild unverändert. */
export function unterschriftZuschneiden(dataUrl: string | null | undefined): string | null {
  if (!dataUrl) return null;
  const alt = cache.get(dataUrl);
  if (alt) return alt;
  let ergebnis = dataUrl;
  try {
    const bytes = base64ZuBytes(dataUrl);
    const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const { width: w, height: h } = img;
    const px = new Uint8Array(UPNG.toRGBA8(img)[0]);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // Tinte = nicht (fast) durchsichtig und nicht (fast) weiß
        if (px[i + 3] > 24 && (px[i] < 230 || px[i + 1] < 230 || px[i + 2] < 230)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= x0 && y1 >= y0) {
      const rand = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03) + 2;
      x0 = Math.max(0, x0 - rand);
      y0 = Math.max(0, y0 - rand);
      x1 = Math.min(w - 1, x1 + rand);
      y1 = Math.min(h - 1, y1 + rand);
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      if (cw < w || ch < h) {
        const neu = new Uint8Array(cw * ch * 4);
        for (let y = 0; y < ch; y++) {
          const von = ((y0 + y) * w + x0) * 4;
          neu.set(px.subarray(von, von + cw * 4), y * cw * 4);
        }
        const png = new Uint8Array(UPNG.encode([neu.buffer], cw, ch, 0));
        ergebnis = `data:image/png;base64,${bytesZuBase64(png)}`;
      }
    }
  } catch (e) {
    console.error("[signatur] Unterschrift nicht zugeschnitten:", e);
  }
  cache.set(dataUrl, ergebnis);
  return ergebnis;
}
