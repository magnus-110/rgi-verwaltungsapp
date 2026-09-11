import { useEffect, useState } from "react";

/**
 * Vorschau von Dateien aus dem Speicher (PDFs, Bilder).
 *
 * Problem: Manche Absender (bzw. deren Mailprogramme) kennzeichnen PDFs nicht
 * als „application/pdf“, sondern z. B. als „application/octet-stream“. Genau
 * so landen die Dateien dann im Speicher. Zeigt man sie über den direkten
 * Speicher-Link in einem <iframe> an, lädt der Browser sie herunter, statt sie
 * anzuzeigen.
 *
 * Lösung: Datei laden, den richtigen Typ bestimmen (am Dateiinhalt, an der
 * Endung oder am gespeicherten Typ) und als lokale blob:-Adresse mit korrektem
 * Typ anzeigen.
 */

const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  txt: "text/plain",
  csv: "text/csv",
  xml: "application/xml",
  json: "application/json",
};

const GENERIC_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/x-download", "application/force-download"]);

/** Ermittelt einen anzeigbaren Dateityp aus Inhalt, Dateiname und gespeichertem Typ. */
export const resolveInlineType = (opts: { head?: Uint8Array | null; fileName?: string | null; mimeType?: string | null }) => {
  const head = opts.head;
  // PDF-Dateien beginnen immer mit „%PDF“
  if (head && head.length >= 4 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
    return "application/pdf";
  }
  const mime = (opts.mimeType || "").split(";")[0].trim().toLowerCase();
  if (mime.includes("pdf")) return "application/pdf";
  const ext = (opts.fileName || "").split(".").pop()?.toLowerCase() || "";
  if (EXT_TYPES[ext] && GENERIC_TYPES.has(mime)) return EXT_TYPES[ext];
  if (!GENERIC_TYPES.has(mime)) return mime;
  return EXT_TYPES[ext] || "application/octet-stream";
};

/** Lädt eine Datei und liefert eine blob:-Adresse (samt erkanntem Typ), die der Browser inline anzeigt. */
export const fetchInlineBlobUrl = async (
  url: string,
  opts: { fileName?: string | null; mimeType?: string | null } = {},
): Promise<{ url: string; type: string }> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (HTTP ${res.status})`);
  const raw = await res.blob();
  const head = new Uint8Array(await raw.slice(0, 8).arrayBuffer());
  const type = resolveInlineType({ head, fileName: opts.fileName, mimeType: opts.mimeType || raw.type });
  return { url: URL.createObjectURL(new Blob([raw], { type })), type };
};

/**
 * Hook: macht aus einem (signierten) Speicher-Link eine anzeigbare blob:-Adresse.
 * Gibt `url: null` zurück, solange geladen wird. Schlägt das Laden fehl, wird
 * der ursprüngliche Link zurückgegeben (dann wie bisher).
 */
export const useInlineFileUrl = (
  sourceUrl: string | null | undefined,
  opts: { fileName?: string | null; mimeType?: string | null } = {},
) => {
  const [state, setState] = useState<{
    source: string | null;
    url: string | null;
    type: string | null;
    loading: boolean;
    error: string | null;
  }>({ source: null, url: null, type: null, loading: false, error: null });
  const { fileName, mimeType } = opts;

  useEffect(() => {
    if (!sourceUrl) {
      setState({ source: null, url: null, type: null, loading: false, error: null });
      return;
    }
    if (sourceUrl.startsWith("blob:") || sourceUrl.startsWith("data:")) {
      setState({ source: sourceUrl, url: sourceUrl, type: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    setState({ source: sourceUrl, url: null, type: null, loading: true, error: null });
    fetchInlineBlobUrl(sourceUrl, { fileName, mimeType })
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result.url);
          return;
        }
        created = result.url;
        setState({ source: sourceUrl, url: result.url, type: result.type, loading: false, error: null });
      })
      .catch((e: any) => {
        if (cancelled) return;
        // Rückfall: direkter Link wie bisher
        setState({ source: sourceUrl, url: sourceUrl, type: null, loading: false, error: e?.message || String(e) });
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [sourceUrl, fileName, mimeType]);

  // Solange der Hook den aktuellen Link noch nicht verarbeitet hat, nichts anzeigen
  const current = state.source === (sourceUrl || null);
  return {
    url: current ? state.url : null,
    /** erkannter Dateityp, z. B. „application/pdf“ (null, solange unbekannt) */
    type: current ? state.type : null,
    loading: !!sourceUrl && (!current || state.loading),
    error: current ? state.error : null,
  };
};
