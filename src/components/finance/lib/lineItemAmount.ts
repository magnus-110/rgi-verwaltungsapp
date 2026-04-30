import { parseAmount } from "./parseAmount";

/**
 * Returns the gross amount of an OCR line item, applying either the item's
 * own VAT rate or, if missing, a fallback rate (typically derived from the
 * invoice or chosen by the user).
 *
 * Items are assumed to carry NET amounts (which matches our OCR output and
 * how invoices are typically printed). The fallback only kicks in when the
 * item has no explicit `vat_rate`.
 */
export function getLineItemGross(item: any, fallbackVatRate: number): number {
  const net = parseAmount(item?.amount);
  const rate =
    item?.vat_rate != null && !isNaN(Number(item.vat_rate))
      ? Number(item.vat_rate)
      : fallbackVatRate;
  return net * (1 + (rate || 0) / 100);
}

/**
 * Best-effort guess of the invoice's overall VAT rate, used as the default
 * fallback for line items that have no per-item rate.
 */
export function inferInvoiceVatRate(invoice: any): number {
  // 1) Explicit field
  const explicit = Number(invoice?.vat_rate);
  if (!isNaN(explicit) && explicit > 0) return explicit;
  // 2) Derived from net + vat amounts
  const net = parseAmount(invoice?.net_amount);
  const vat = parseAmount(invoice?.vat_amount);
  if (net > 0 && vat > 0) {
    const r = (vat / net) * 100;
    // round to nearest common rate
    const common = [0, 7, 19];
    const closest = common.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a), 19);
    if (Math.abs(closest - r) < 1) return closest;
    return Math.round(r * 10) / 10;
  }
  // 3) Default
  return 19;
}
