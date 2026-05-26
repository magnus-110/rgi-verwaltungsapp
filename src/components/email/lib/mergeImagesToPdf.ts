import jsPDF from "jspdf";

export interface ImageSource {
  blob: Blob;
  mimeType: string | null;
  fileName: string;
}

const loadImage = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });

const detectFormat = (mimeType: string | null, fileName: string): "JPEG" | "PNG" => {
  const lower = (mimeType || "").toLowerCase();
  if (lower.includes("png") || fileName.toLowerCase().endsWith(".png")) return "PNG";
  return "JPEG";
};

/**
 * Merge multiple images into a single A4 PDF (one image per page, fit-to-page).
 */
export async function mergeImagesToPdf(images: ImageSource[]): Promise<Blob> {
  if (images.length === 0) throw new Error("Keine Bilder zum Zusammenführen");

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  for (let i = 0; i < images.length; i++) {
    const src = images[i];
    const img = await loadImage(src.blob);
    const ratio = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;

    // Convert to dataURL via canvas for jsPDF
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const format = detectFormat(src.mimeType, src.fileName);
    const dataUrl = canvas.toDataURL(format === "PNG" ? "image/png" : "image/jpeg", 0.92);

    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, format, x, y, w, h, undefined, "FAST");
  }

  return pdf.output("blob");
}
