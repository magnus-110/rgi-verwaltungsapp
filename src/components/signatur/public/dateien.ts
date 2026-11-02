import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export type Upload = {
  id: string;
  name: string;
  mime: string;
  /** reines Base64 ohne „data:…;base64,“ */
  base64: string;
  seiten: number;
};

export class DateiFehler extends Error {}

const MAX_KANTE = 2000;
const QUALITAET = 0.85;

export const istHeic = (f: File) => /hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
export const istPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
export const istBild = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(f.name);

const lies = (f: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new DateiFehler("Die Datei konnte nicht gelesen werden."));
    r.readAsDataURL(f);
  });

const ohnePrefix = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

const ladeBild = (f: File) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new DateiFehler(`„${f.name}“ konnte nicht geöffnet werden. Bitte als JPG oder PDF senden.`)); };
    img.src = url;
  });

/** Fotos auf max. 2000 px Kantenlänge verkleinern (JPEG 0,85); kleine Bilder bleiben unverändert. */
async function bildVorbereiten(f: File): Promise<{ mime: string; base64: string; name: string }> {
  const img = await ladeBild(f);
  const w = img.naturalWidth, h = img.naturalHeight;
  const gross = Math.max(w, h) > MAX_KANTE || f.size > 1.5 * 1024 * 1024;
  const passendesFormat = /^image\/(jpeg|png)$/.test(f.type);
  if (!gross && passendesFormat) return { mime: f.type, base64: ohnePrefix(await lies(f)), name: f.name };
  const s = Math.min(1, MAX_KANTE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", QUALITAET);
  return { mime: "image/jpeg", base64: ohnePrefix(url), name: f.name.replace(/\.[^.]+$/, "") + ".jpg" };
}

async function pdfSeiten(f: File): Promise<number> {
  try {
    const data = new Uint8Array(await f.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const n = doc.numPages;
    void doc.destroy();
    return n;
  } catch {
    throw new DateiFehler(`„${f.name}“ ist kein lesbares PDF.`);
  }
}

let zaehler = 0;

export async function dateiVorbereiten(f: File): Promise<Upload> {
  const id = `u${Date.now()}-${zaehler++}`;
  if (istHeic(f)) throw new DateiFehler("Bitte als JPG oder PDF senden – das Format HEIC können wir leider nicht verarbeiten.");
  if (istPdf(f)) {
    const seiten = await pdfSeiten(f);
    return { id, name: f.name, mime: "application/pdf", base64: ohnePrefix(await lies(f)), seiten };
  }
  if (istBild(f)) {
    const b = await bildVorbereiten(f);
    return { id, ...b, seiten: 1 };
  }
  throw new DateiFehler(`„${f.name}“: Bitte nur Fotos (JPG/PNG) oder PDF hochladen.`);
}
