/**
 * Datei für die Vorschau laden (URL oder Blob) und den echten Typ erkennen.
 *
 * Manche Dateien liegen im Speicher als „application/octet-stream“ oder ohne
 * Endung. Deshalb wird die Datei einmal geladen und am Inhalt erkannt
 * (PDF, PNG, JPEG, GIF, WEBP). Fallback: gespeicherter Typ bzw. Endung.
 */
import { useEffect, useState } from "react";
import { resolveInlineType } from "@/lib/inlineFile";

export type DateiQuelle = string | Blob | null | undefined;

export const istPdfTyp = (mime?: string | null, name?: string | null) =>
  (mime || "").toLowerCase().includes("pdf") || /\.pdf$/i.test(name || "");

export const istBildTyp = (mime?: string | null, name?: string | null) =>
  (mime || "").toLowerCase().startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|heic|heif)$/i.test(name || "");

export const istTextTyp = (mime?: string | null, name?: string | null) => {
  const m = (mime || "").toLowerCase();
  return m.startsWith("text/") || m.includes("xml") || m.includes("json") || /\.(txt|csv|xml|json|md|log)$/i.test(name || "");
};

/** Lässt sich die Datei in der App anzeigen (PDF oder Bild)? */
export const kannVorschau = (mime?: string | null, name?: string | null) => istPdfTyp(mime, name) || istBildTyp(mime, name);

/** Dateiname aus einer (signierten) Speicher-Adresse. */
export const nameAusUrl = (url: string) => {
  try {
    const u = new URL(url, window.location.href);
    if (u.protocol === "blob:" || u.protocol === "data:") return "";
    return decodeURIComponent(u.pathname.split("/").pop() || "");
  } catch {
    return "";
  }
};

/** Bildformate am Dateianfang erkennen (PDF erkennt resolveInlineType selbst). */
const bildAusKopf = (h: Uint8Array): string | null => {
  if (h.length >= 4 && h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return "image/png";
  if (h.length >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "image/jpeg";
  if (h.length >= 4 && h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x38) return "image/gif";
  if (h.length >= 12 && h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50)
    return "image/webp";
  return null;
};

export const typErkennen = (kopf: Uint8Array | null, dateiName?: string | null, mimeType?: string | null) => {
  const istPdfKopf = !!kopf && kopf.length >= 4 && kopf[0] === 0x25 && kopf[1] === 0x50 && kopf[2] === 0x44 && kopf[3] === 0x46;
  if (istPdfKopf) return "application/pdf";
  const bild = kopf ? bildAusKopf(kopf) : null;
  if (bild) return bild;
  return resolveInlineType({ head: null, fileName: dateiName, mimeType });
};

export interface GeladeneDatei {
  /** Inhalt mit korrektem Typ (null, solange geladen wird oder bei Fehler) */
  blob: Blob | null;
  /** blob:-Adresse zum Anzeigen/Herunterladen; bei Ladefehler die Original-Adresse */
  url: string | null;
  /** erkannter Typ, z. B. „application/pdf“ */
  typ: string | null;
  laedt: boolean;
  fehler: string | null;
}

/** Lädt eine Datei (URL oder Blob) einmal und liefert Blob, blob:-Adresse und Typ. */
export function useDateiBlob(quelle: DateiQuelle, opts: { dateiName?: string | null; mimeType?: string | null } = {}): GeladeneDatei {
  const { dateiName, mimeType } = opts;
  const [st, setSt] = useState<GeladeneDatei & { quelle: DateiQuelle }>({
    quelle: null, blob: null, url: null, typ: null, laedt: false, fehler: null,
  });

  useEffect(() => {
    if (!quelle) {
      setSt({ quelle: null, blob: null, url: null, typ: null, laedt: false, fehler: null });
      return;
    }
    let abbruch = false;
    let erstellt: string | null = null;
    const name = dateiName || (typeof quelle === "string" ? nameAusUrl(quelle) : (quelle as File).name) || "";
    setSt({ quelle, blob: null, url: null, typ: null, laedt: true, fehler: null });
    (async () => {
      let roh: Blob;
      if (typeof quelle === "string") {
        const res = await fetch(quelle);
        if (!res.ok) throw new Error(`Die Datei konnte nicht geladen werden (HTTP ${res.status}).`);
        roh = await res.blob();
      } else {
        roh = quelle;
      }
      const kopf = new Uint8Array(await roh.slice(0, 16).arrayBuffer());
      const typ = typErkennen(kopf, name, mimeType || roh.type);
      const blob = roh.type === typ ? roh : new Blob([roh], { type: typ });
      return { blob, typ };
    })()
      .then(({ blob, typ }) => {
        if (abbruch) return;
        erstellt = URL.createObjectURL(blob);
        setSt({ quelle, blob, url: erstellt, typ, laedt: false, fehler: null });
      })
      .catch((e: unknown) => {
        if (abbruch) return;
        const typ = typErkennen(null, name, mimeType || (typeof quelle !== "string" ? quelle.type : null));
        setSt({
          quelle, blob: null, typ, laedt: false,
          url: typeof quelle === "string" ? quelle : null,
          fehler: e instanceof Error ? e.message : String(e),
        });
      });
    return () => {
      abbruch = true;
      if (erstellt) URL.revokeObjectURL(erstellt);
    };
  }, [quelle, dateiName, mimeType]);

  // Solange der neue Inhalt noch nicht verarbeitet ist, nichts Altes zeigen
  const aktuell = st.quelle === (quelle || null);
  if (!aktuell) return { blob: null, url: null, typ: null, laedt: !!quelle, fehler: null };
  return { blob: st.blob, url: st.url, typ: st.typ, laedt: st.laedt, fehler: st.fehler };
}
