/**
 * Generates the booking description for a template-based booking.
 *
 * Special rule for Hausgeld (HG) templates:
 *   "MM/JJ HG <Nachname>"   e.g. "01/25 HG Göttinger"
 *
 * Heuristic:
 *   - If the template name contains "Hausgeld" or starts with "HG"
 *   - AND a vendor_name is set, we extract the last word as surname.
 *   - Period MM/JJ is derived from the transaction's booking date.
 *
 * Otherwise we fall back to the template name.
 */
export function buildTemplateBookingText(
  template: { name?: string | null; vendor_name?: string | null } | null | undefined,
  bookingDate?: string | Date | null
): string {
  if (!template) return "";
  const name = (template.name || "").trim();
  const vendor = (template.vendor_name || "").trim();

  const isHausgeld =
    /hausgeld/i.test(name) || /^hg[\s_-]/i.test(name) || /^hg$/i.test(name);

  if (isHausgeld && vendor) {
    // last token = surname (works for "Magnus Göttinger", "Frau Dagmar Wollmann",
    // "Dres. Christian und Daniela Haberland" -> "Haberland")
    const surname = vendor.split(/\s+/).filter(Boolean).pop() || vendor;

    const d = bookingDate ? new Date(bookingDate) : new Date();
    const valid = !isNaN(d.getTime());
    const mm = valid ? String(d.getMonth() + 1).padStart(2, "0") : "";
    const yy = valid ? String(d.getFullYear()).slice(-2) : "";
    const period = mm && yy ? `${mm}/${yy} ` : "";

    return `${period}HG ${surname}`.trim();
  }

  return name;
}
