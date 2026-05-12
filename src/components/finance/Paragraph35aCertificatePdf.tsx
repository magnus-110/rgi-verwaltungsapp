import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import {
  AccountBlock,
  
  OwnerAssignment,
  buildOwnerCertificate,
  formatBookingLabel,
  getOwnerShare,
  ownerAddress,
  ownerDisplayName,
  ownerSalutation,
  DISTRIBUTION_LABELS,
} from "./lib/paragraph35aDistribution";

const LOGO_URL = "/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png";

export interface CertificateContext {
  building: { name?: string | null; address?: string | null };
  fiscalYear: number;
  periodFrom?: string | null;
  periodTo?: string | null;
  blocks: AccountBlock[];
  shareCtx: Parameters<typeof getOwnerShare>[2];
  logoBase64: string | null;
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtShare = (n: number, key: string) => {
  if (key === "mea") return n.toFixed(3);
  if (key === "qm") return n.toFixed(2);
  if (key === "heizk_abr") return (n * 100).toFixed(2) + " %";
  return n.toFixed(0);
};

const fmtDateDe = (s?: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("de-DE");
};

function daysBetween(from?: string | null, to?: string | null): number {
  if (!from || !to) return 0;
  const a = new Date(from);
  const b = new Date(to);
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

export function buildCertificateHtml(owner: OwnerAssignment, ctx: CertificateContext, idx: number = 0): string {
  const { blocks, total, totalDienste, totalHandwerker } = buildOwnerCertificate(owner, ctx.blocks, ctx.shareCtx);
  const sal = ownerSalutation(owner);
  const name = ownerDisplayName(owner);
  const addr = ownerAddress(owner);
  const unitNo = (owner.unit_number || "").padStart(4, "0");
  const buildingShort = "1001";
  const certNo = `a${buildingShort}${ctx.fiscalYear}${unitNo}3112`;
  const tage = daysBetween(ctx.periodFrom, ctx.periodTo);

  const blocksHtml = blocks
    .map((bl) => {
      const keyLabel = DISTRIBUTION_LABELS[bl.key] || bl.key;
      const linesHtml = bl.lines
        .map((ln) => {
          return `<tr>
            <td style="padding:4px 6px;border-bottom:1px solid #eee;font-size:9.5pt;">${escapeHtml(formatBookingLabel(ln.booking))}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-size:9.5pt;">${fmtEUR(ln.gross)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-size:9.5pt;">${fmtEUR(ln.labor)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-size:9.5pt;">${fmtShare(ln.totalShare, bl.key)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-size:9.5pt;">${fmtShare(ln.ownerShare, bl.key)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-size:9.5pt;">${fmtEUR(ln.ownerCost)}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-size:9.5pt;color:#0a6">${ln.ownerCostDienste > 0 ? fmtEUR(ln.ownerCostDienste) : "–"}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-size:9.5pt;color:#06a">${ln.ownerCostHandwerker > 0 ? fmtEUR(ln.ownerCostHandwerker) : "–"}</td>
          </tr>`;
        })
        .join("");
      return `
        <tr><td colspan="8" style="padding:10px 6px 4px;font-weight:bold;font-size:10pt;background:#f7f7f7;">
          ${escapeHtml(bl.account.account_number)} ${escapeHtml(bl.account.account_name)} – Verteilung nach ${escapeHtml(keyLabel)}
        </td></tr>
        ${linesHtml}
        <tr style="font-weight:bold;background:#fafafa;">
          <td style="padding:5px 6px;font-size:9.5pt;">Summe</td>
          <td style="padding:5px 6px;text-align:right;font-size:9.5pt;">${fmtEUR(bl.subtotalGross)}</td>
          <td style="padding:5px 6px;text-align:right;font-size:9.5pt;">${fmtEUR(bl.subtotalLabor)}</td>
          <td></td><td></td>
          <td style="padding:5px 6px;text-align:right;font-size:9.5pt;">${fmtEUR(bl.subtotalOwnerCost)}</td>
          <td style="padding:5px 6px;text-align:right;font-size:9.5pt;color:#0a6">${fmtEUR(bl.subtotalOwnerCostDienste)}</td>
          <td style="padding:5px 6px;text-align:right;font-size:9.5pt;color:#06a">${fmtEUR(bl.subtotalOwnerCostHandwerker)}</td>
        </tr>
      `;
    })
    .join("");
      return `
        <tr><td colspan="6" style="padding:10px 6px 4px;font-weight:bold;font-size:10pt;background:#f7f7f7;">
          ${escapeHtml(bl.account.account_number)} ${escapeHtml(bl.account.account_name)} – Verteilung nach ${escapeHtml(keyLabel)}
        </td></tr>
        ${linesHtml}
        <tr style="font-weight:bold;background:#fafafa;">
          <td style="padding:5px 6px;font-size:9.5pt;">Summe</td>
          <td style="padding:5px 6px;text-align:right;font-size:9.5pt;">${fmtEUR(bl.subtotalGross)}</td>
          <td style="padding:5px 6px;text-align:right;font-size:9.5pt;">${fmtEUR(bl.subtotalLabor)}</td>
          <td></td><td></td>
          <td style="padding:5px 6px;text-align:right;font-size:9.5pt;">${fmtEUR(bl.subtotalOwnerCost)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div style="font-family:'Work Sans',Arial,sans-serif;color:#222;padding:30mm 20mm;width:210mm;min-height:297mm;box-sizing:border-box;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          ${ctx.logoBase64 ? `<img src="${ctx.logoBase64}" style="height:46px;object-fit:contain;" />` : `<div style="font-family:'Century Gothic',sans-serif;font-size:18pt;font-weight:bold;color:#c97a2b;">RGI IMMOBILIEN</div>`}
          <div style="font-size:9pt;color:#777;margin-top:4px;">Verkauf · Vermietung · Verwaltung</div>
        </div>
        <div style="text-align:right;font-size:8pt;color:#666;">
          RGI-Immobilien GmbH &amp; Co.KG, Schützenstr. 16, 87459 Pfronten
        </div>
      </div>

      <div style="margin-top:18mm;display:flex;justify-content:space-between;gap:10mm;">
        <div style="flex:1;font-size:10pt;line-height:1.45;">
          ${sal ? `<div>${escapeHtml(sal)}</div>` : ""}
          <div>${escapeHtml(name)}</div>
          <div>${escapeHtml(addr.street || "")}</div>
          <div>${escapeHtml((addr.zip || "") + " " + (addr.city || "")).trim()}</div>
        </div>
        <table style="border-collapse:collapse;font-size:9pt;">
          <tr><td colspan="2" style="font-family:'Century Gothic',sans-serif;font-weight:bold;font-size:11pt;padding-bottom:4px;">Jahresabrechnung ${ctx.fiscalYear}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;">Nummer</td><td>${certNo}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;">erstellt am</td><td>${fmtDateDe(new Date().toISOString())}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;">Abr. ab</td><td>${fmtDateDe(ctx.periodFrom)}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;">Abr. bis</td><td>${fmtDateDe(ctx.periodTo)}</td></tr>
          <tr><td style="padding:2px 8px 2px 0;">Zeitraum</td><td>${tage} Tage</td></tr>
          <tr><td colspan="2" style="font-weight:bold;padding-top:6px;">Einheit ${escapeHtml(owner.unit_number || "")}</td></tr>
          ${owner.floor_location ? `<tr><td colspan="2">${escapeHtml(owner.floor_location)}</td></tr>` : ""}
        </table>
      </div>

      <h2 style="font-family:'Century Gothic',sans-serif;font-size:13pt;margin:14mm 0 1mm 0;color:#222;">
        ${escapeHtml(ctx.building.name || "")}${ctx.building.address ? ` in ${escapeHtml(ctx.building.address)}` : ""}
      </h2>
      <div style="font-size:10pt;color:#444;margin-bottom:6mm;">
        Haushaltsnahe Leistungen ${ctx.fiscalYear} für die Einheit ${escapeHtml(owner.unit_number || "")}${owner.floor_location ? `, ${escapeHtml(owner.floor_location)}` : ""}
      </div>

      <table style="width:100%;border-collapse:collapse;border-top:2px solid #333;">
        <thead>
          <tr style="background:#eee;">
            <th style="padding:6px;text-align:left;font-size:9.5pt;">Beleg</th>
            <th style="padding:6px;text-align:right;font-size:9.5pt;">Gesamt EUR</th>
            <th style="padding:6px;text-align:right;font-size:9.5pt;">Lohnkosten EUR</th>
            <th style="padding:6px;text-align:right;font-size:9.5pt;">Gesamtanteil</th>
            <th style="padding:6px;text-align:right;font-size:9.5pt;">Ihr Anteil</th>
            <th style="padding:6px;text-align:right;font-size:9.5pt;">Ihre Kosten EUR</th>
          </tr>
        </thead>
        <tbody>
          ${blocksHtml}
          <tr style="border-top:2px solid #333;font-weight:bold;background:#f0f0f0;">
            <td style="padding:8px 6px;font-size:10pt;" colspan="5">Gesamt §35a EStG</td>
            <td style="padding:8px 6px;text-align:right;font-size:10pt;">${fmtEUR(total)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:12mm;font-size:8.5pt;color:#555;line-height:1.5;">
        Die Hausverwaltung teilt die Aufwendungen für die haushaltsnahen Lohnleistungen mit. Eine Anerkennung muss durch das zuständige Finanzamt unter Berücksichtigung Ihrer steuerlichen Situation erfolgen. Eine Haftung unsererseits ist ausgeschlossen.
      </div>

      <div style="margin-top:14mm;text-align:center;font-size:8pt;color:#999;">Seite 1 von 1</div>
    </div>
  `;
}

async function renderHtmlToPdfBlob(html: string): Promise<Blob> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    const node = container.firstElementChild as HTMLElement;
    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const imgH = (canvas.height * pageW) / canvas.width;
    if (imgH <= pageH) {
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, imgH);
    } else {
      // Multi-page split
      let remaining = imgH;
      let y = 0;
      while (remaining > 0) {
        pdf.addImage(imgData, "JPEG", 0, -y, pageW, imgH);
        remaining -= pageH;
        y += pageH;
        if (remaining > 0) pdf.addPage();
      }
    }
    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}

function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

export async function loadLogoBase64(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const c = canvas.getContext("2d");
      if (!c) return resolve(null);
      c.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = `${window.location.origin}${LOGO_URL}`;
  });
}

export async function generate35aPdf(owner: OwnerAssignment, ctx: CertificateContext): Promise<void> {
  const html = buildCertificateHtml(owner, ctx, 0);
  const blob = await renderHtmlToPdfBlob(html);
  const fileName = `35a_${ctx.fiscalYear}_${safeFileName(owner.unit_number || "")}_${safeFileName(ownerDisplayName(owner))}.pdf`;
  triggerDownload(blob, fileName);
}

export async function generate35aZip(
  owners: OwnerAssignment[],
  ctx: CertificateContext,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const zip = new JSZip();
  for (let i = 0; i < owners.length; i++) {
    const o = owners[i];
    const html = buildCertificateHtml(o, ctx, i);
    const blob = await renderHtmlToPdfBlob(html);
    const fileName = `35a_${ctx.fiscalYear}_${safeFileName(o.unit_number || "")}_${safeFileName(ownerDisplayName(o))}.pdf`;
    zip.file(fileName, blob);
    onProgress?.(i + 1, owners.length);
    await new Promise((r) => setTimeout(r, 30));
  }
  const out = await zip.generateAsync({ type: "blob" });
  triggerDownload(out, `35a_Bescheinigungen_${ctx.fiscalYear}.zip`);
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

