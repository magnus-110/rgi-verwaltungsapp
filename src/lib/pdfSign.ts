/**
 * PDF unterschreiben — der technische Kern.
 *
 * Die Unterschrift (ein Bild), Texte wie „Pfronten, 01.10.2026“ und Haken
 * werden fest in das PDF eingesetzt. Das Original bleibt dabei unangetastet,
 * es entsteht eine neue Datei.
 *
 * Koordinaten: Alle Positionen kommen aus der Ansicht im Browser, also so,
 * wie die Seite auf dem Bildschirm aussieht (Ursprung oben links, Einheit
 * PDF-Punkte, gedrehte Seiten schon gedreht). Beim Einsetzen werden sie in
 * das Koordinatensystem der PDF-Seite umgerechnet — auch bei gedrehten Seiten
 * und Seiten mit Beschnittrand.
 *
 * pdf-lib wird bei Bedarf aus dem CDN geladen (wie der PDF-Anzeige-Worker),
 * damit das Paket nicht im Haupt-Bundle landet.
 */

export type SignItemBase = {
  id: string;
  /** Seitenindex, beginnend bei 0 */
  page: number;
  /** Position/Größe in PDF-Punkten, Ansichtskoordinaten (oben links = 0/0) */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SignItem =
  | (SignItemBase & { kind: "image"; dataUrl: string })
  | (SignItemBase & { kind: "text"; text: string; fontSize: number })
  | (SignItemBase & { kind: "check" });

/** Zeilenhöhe von Textfeldern im Verhältnis zur Schriftgröße (Ansicht und PDF identisch). */
export const TEXT_LINE_HEIGHT = 1.25;
/** Abstand der Grundlinie vom unteren Rand eines Textfeldes (Anteil der Schriftgröße). */
const TEXT_BASELINE_FROM_BOTTOM = 0.22;

const PDF_LIB_URLS = [
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js",
  "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PdfLib = any;

let pdfLibPromise: Promise<PdfLib> | null = null;

/** Lädt pdf-lib einmalig (mit Ausweich-Adresse). */
export const loadPdfLib = (): Promise<PdfLib> => {
  if (!pdfLibPromise) {
    pdfLibPromise = (async () => {
      let lastErr: unknown = null;
      for (const url of PDF_LIB_URLS) {
        try {
          return await import(/* @vite-ignore */ url);
        } catch (e) {
          lastErr = e;
        }
      }
      pdfLibPromise = null;
      throw new Error(
        "PDF-Werkzeug konnte nicht geladen werden. Bitte Internetverbindung prüfen. " +
          (lastErr instanceof Error ? `(${lastErr.message})` : ""),
      );
    })();
  }
  return pdfLibPromise;
};

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * Matrix, die Ansichtskoordinaten (oben links, y nach unten) auf die
 * PDF-Seite abbildet — abhängig von Drehung und sichtbarem Bereich.
 */
export const viewToPdfMatrix = (
  rotation: number,
  box: { x: number; y: number; width: number; height: number },
): [number, number, number, number, number, number] => {
  const r = (((rotation % 360) + 360) % 360) as 0 | 90 | 180 | 270;
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
};

/** Text auf Zeichen beschränken, die die Standardschrift darstellen kann. */
const sanitizeText = (font: { encodeText: (t: string) => unknown }, text: string) => {
  let out = "";
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
};

/**
 * Setzt alle Elemente in das PDF ein und liefert die neue Datei.
 * `lib` = pdf-lib (über `loadPdfLib()`; in Tests direkt übergeben).
 */
export const stampPdf = async (lib: PdfLib, sourceBytes: Uint8Array | ArrayBuffer, items: SignItem[]): Promise<Uint8Array> => {
  const {
    PDFDocument,
    StandardFonts,
    rgb,
    pushGraphicsState,
    popGraphicsState,
    concatTransformationMatrix,
  } = lib;

  const doc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const imageCache = new Map<string, unknown>();
  const touched = new Set<number>();

  for (const item of items) {
    const page = pages[item.page];
    if (!page) continue;

    // Bisherigen Seiteninhalt einmalig in q … Q einklammern, damit eine
    // nicht sauber abgeschlossene Grafik-Einstellung im Original unsere
    // Elemente nicht verschiebt.
    if (!touched.has(item.page)) {
      touched.add(item.page);
      wrapExistingContent(lib, doc, page);
    }

    const crop = page.getCropBox();
    const m = viewToPdfMatrix(page.getRotation().angle, crop);

    // Ansicht -> PDF, dann an die linke untere Ecke des Elements springen und
    // y wieder nach oben zeigen lassen. Ab da wird „normal“ gezeichnet.
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...m),
      concatTransformationMatrix(1, 0, 0, -1, item.x, item.y + item.h),
    );

    if (item.kind === "image") {
      let img = imageCache.get(item.dataUrl);
      if (!img) {
        const bytes = dataUrlToBytes(item.dataUrl);
        img = item.dataUrl.startsWith("data:image/jp")
          ? await doc.embedJpg(bytes)
          : await doc.embedPng(bytes);
        imageCache.set(item.dataUrl, img);
      }
      page.drawImage(img, { x: 0, y: 0, width: item.w, height: item.h });
    } else if (item.kind === "text") {
      const text = sanitizeText(font, item.text || "");
      if (text.trim()) {
        page.drawText(text, {
          x: 0,
          y: item.fontSize * TEXT_BASELINE_FROM_BOTTOM,
          size: item.fontSize,
          font,
          color: rgb(0.04, 0.04, 0.12),
        });
      }
    } else if (item.kind === "check") {
      const t = Math.max(1, Math.min(item.w, item.h) * 0.12);
      const color = rgb(0.04, 0.04, 0.12);
      page.drawLine({ start: { x: item.w * 0.12, y: item.h * 0.5 }, end: { x: item.w * 0.4, y: item.h * 0.18 }, thickness: t, color, lineCap: 1 });
      page.drawLine({ start: { x: item.w * 0.4, y: item.h * 0.18 }, end: { x: item.w * 0.9, y: item.h * 0.85 }, thickness: t, color, lineCap: 1 });
    }

    page.pushOperators(popGraphicsState());
  }

  return doc.save({ useObjectStreams: false });
};

/** Klammert den vorhandenen Inhalt einer Seite in q … Q ein. */
const wrapExistingContent = (lib: PdfLib, doc: PdfLib, page: PdfLib) => {
  try {
    const { PDFName, PDFArray, pushGraphicsState, popGraphicsState } = lib;
    const contents = page.node.get(PDFName.of("Contents"));
    if (!contents) return;
    const qRef = doc.context.register(doc.context.contentStream(pushGraphicsState()));
    const bigQRef = doc.context.register(doc.context.contentStream(popGraphicsState()));
    const arr = PDFArray.withContext(doc.context);
    arr.push(qRef);
    const resolved = doc.context.lookup(contents);
    if (resolved instanceof PDFArray) {
      for (let i = 0; i < resolved.size(); i++) arr.push(resolved.get(i));
    } else {
      arr.push(contents);
    }
    arr.push(bigQRef);
    page.node.set(PDFName.of("Contents"), arr);
  } catch {
    // Im Zweifel ohne Klammer weiter — funktioniert bei fast allen PDFs.
  }
};

/**
 * Schneidet eine gezeichnete Unterschrift auf den tatsächlich bemalten
 * Bereich zu (ohne den leeren Rand des Zeichenfeldes).
 */
export const trimSignatureDataUrl = (dataUrl: string, padding = 6): Promise<{ dataUrl: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        reject(new Error("Keine Unterschrift erkannt"));
        return;
      }
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(width - 1, maxX + padding);
      maxY = Math.min(height - 1, maxY + padding);
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      out.getContext("2d")!.drawImage(c, minX, minY, w, h, 0, 0, w, h);
      resolve({ dataUrl: out.toDataURL("image/png"), width: w, height: h });
    };
    img.onerror = () => reject(new Error("Unterschrift konnte nicht gelesen werden"));
    img.src = dataUrl;
  });

/** Dateiname für die unterschriebene Fassung: „Vertrag.pdf“ -> „Vertrag_unterschrieben.pdf“. */
export const signedFileName = (name: string) => {
  const base = (name || "Dokument").replace(/\.pdf$/i, "").replace(/_unterschrieben$/i, "");
  return `${base}_unterschrieben.pdf`;
};
