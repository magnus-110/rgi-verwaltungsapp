import { buildBookingText } from "./bookingTextBuilder";

/**
 * Generiert den Buchungstext für eine Vorlagen-basierte Buchung.
 *
 * Standard-Schema (RGI):
 *   "MM/JJ Re. Nr. <invoice_number> <Lieferant> <Gegenkonto>"
 * Bestandteile, die fehlen, werden weggelassen.
 *
 * Sonderregel Hausgeld (HG):
 *   "MM/JJ HG <Nachname>"   z.B. "01/25 HG Göttinger"
 */
export function buildTemplateBookingText(
  template:
    | {
        name?: string | null;
        vendor_name?: string | null;
        chart_of_accounts?: { account_name?: string | null } | null;
      }
    | null
    | undefined,
  bookingDate?: string | Date | null,
  options?: {
    invoiceNumber?: string | null;
    counterAccountName?: string | null;
  },
): string {
  if (!template) return "";
  const name = (template.name || "").trim();
  const vendor = (template.vendor_name || "").trim();

  const d = bookingDate ? new Date(bookingDate) : new Date();
  const valid = !isNaN(d.getTime());
  const mm = valid ? String(d.getMonth() + 1).padStart(2, "0") : "";
  const yy = valid ? String(d.getFullYear()).slice(-2) : "";
  const period = mm && yy ? `${mm}/${yy}` : "";

  const isHausgeld =
    /hausgeld/i.test(name) || /^hg[\s_-]/i.test(name) || /^hg$/i.test(name);

  if (isHausgeld && vendor) {
    const surname = vendor.split(/\s+/).filter(Boolean).pop() || vendor;
    return `${period ? period + " " : ""}HG ${surname}`.trim();
  }

  const counterAccountName =
    options?.counterAccountName ?? template.chart_of_accounts?.account_name ?? null;

  const text = buildBookingText({
    period,
    invoiceNumber: options?.invoiceNumber,
    vendorName: vendor,
    counterAccountName,
  });

  // Fallback: wenn nichts zusammenkommt, alten Template-Namen nutzen
  return text || name;
}
