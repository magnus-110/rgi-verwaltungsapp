// Unterschriftenseite unter dem Versammlungsprotokoll (§ 24 Abs. 6 WEG).
// Je Rolle: links „Ort, Datum", rechts Unterschrift mit Namen darunter.
// Nicht unterschriebene Rollen bleiben als leere Linien zum Ausfüllen.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

export const UNTERSCHRIFT_ROLLEN = [
  { key: "leiter", label: "Versammlungsleitung" },
  { key: "protokollant", label: "Protokollführung" },
  { key: "eigentuemer", label: "Wohnungseigentümer/in" },
  { key: "beirat", label: "Verwaltungsbeirat (Vorsitz oder Vertretung)" },
] as const;

const TZ = "Europe/Berlin";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Ort aus einer Adresse wie „Oberer Wirt, Kirchsteige 10, 87459 Pfronten" */
export function ortAus(adresse: string | null | undefined, fallback = "Pfronten"): string {
  const m = (adresse || "").match(/\b\d{5}\s+([^,\n]+)/);
  return (m?.[1] || fallback).trim();
}

export async function unterschriftenSeiteAnhaengen(
  pdfBytes: Uint8Array | ArrayBuffer,
  o: { signatures: any[]; titel: string; liegenschaft: string; datum: string; ort: string },
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 50;
  const orange = rgb(0.941, 0.549, 0.122);
  const grau = rgb(0.45, 0.45, 0.45);
  const linie = rgb(0.35, 0.35, 0.35);
  let y = height - margin;

  page.drawText("Unterschriften", { x: margin, y, size: 18, font: fontBold, color: orange });
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: orange });
  y -= 30;
  page.drawText(`Protokoll: ${o.titel}`, { x: margin, y, size: 11, font });
  y -= 16;
  page.drawText(`Liegenschaft: ${o.liegenschaft}`, { x: margin, y, size: 11, font });
  y -= 16;
  page.drawText(`Datum der Versammlung: ${o.datum}`, { x: margin, y, size: 11, font });
  y -= 42;

  const links = { von: margin, bis: margin + 180 };
  const rechts = { von: margin + 215, bis: width - margin };
  const BILD_H = 58;

  for (const r of UNTERSCHRIFT_ROLLEN) {
    const sig = o.signatures.find((s: any) => s.role === r.key);
    page.drawText(r.label, { x: margin, y, size: 12, font: fontBold });
    y -= 10;
    const grund = y - BILD_H; // Höhe der Unterschriftslinie

    if (sig) {
      try {
        const img = await pdfDoc.embedPng(dataUrlToBytes(sig.signature_png));
        const w = Math.min(200, rechts.bis - rechts.von);
        const h = Math.min(BILD_H - 4, w * (img.height / img.width));
        const bw = h / (img.height / img.width);
        page.drawImage(img, { x: rechts.von, y: grund + 2, width: bw, height: h });
      } catch (e) {
        console.error("Signatur-PNG konnte nicht eingebettet werden", e);
      }
      const tag = sig.signed_at ? new Date(sig.signed_at).toLocaleDateString("de-DE", { timeZone: TZ }) : "";
      page.drawText(`${o.ort}${tag ? `, ${tag}` : ""}`, { x: links.von, y: grund + 5, size: 11, font });
    }

    page.drawLine({ start: { x: links.von, y: grund }, end: { x: links.bis, y: grund }, thickness: 0.7, color: linie });
    page.drawLine({ start: { x: rechts.von, y: grund }, end: { x: rechts.bis, y: grund }, thickness: 0.7, color: linie });
    page.drawText("Ort, Datum", { x: links.von, y: grund - 12, size: 8, font, color: grau });
    page.drawText(sig?.signer_name ? sig.signer_name : "Unterschrift, Name", {
      x: rechts.von,
      y: grund - 12,
      size: sig?.signer_name ? 9 : 8,
      font,
      color: sig?.signer_name ? linie : grau,
    });
    y = grund - 44;
  }

  return await pdfDoc.save();
}
