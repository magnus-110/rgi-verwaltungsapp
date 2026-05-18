import type { LineItemDetail, Type35a } from "./Section35aEditor";

export interface AiSelectedItem {
  index: number;
  type_35a?: Type35a;
  reason?: string;
}

/**
 * Builds line_items_detail entries for §35a.
 *
 * Preferred path (new): the AI returned `aiSelectedItems` — concrete invoice
 * positions selected by index. We pick exactly these and mark them with
 * `ai_picked` + `ai_reason` for UI transparency. No numbers are invented.
 *
 * Legacy/fallback path: if `aiSelectedItems` is empty but a gross amount was
 * suggested AND no real OCR line items exist, we create a single custom entry
 * so the user can edit it. With existing line items we now refuse to guess.
 */
export function build35aDetailFromSuggestion(
  invoiceLineItems: any[] | null | undefined,
  suggestedGrossAmount: number,
  defaultType35a: Type35a,
  vatRate: number = 19,
  aiSelectedItems?: AiSelectedItem[] | null,
): LineItemDetail[] {
  // ---- Preferred: AI picked concrete positions ----
  if (
    Array.isArray(invoiceLineItems) &&
    invoiceLineItems.length > 0 &&
    Array.isArray(aiSelectedItems) &&
    aiSelectedItems.length > 0
  ) {
    return aiSelectedItems
      .filter(sel => sel.index >= 0 && sel.index < invoiceLineItems.length)
      .map(sel => {
        const raw = invoiceLineItems[sel.index];
        const net = parseFloat(raw?.amount ?? raw?.total ?? 0) || 0;
        return {
          index: sel.index,
          description: raw?.description || raw?.name || `Position ${sel.index + 1}`,
          amount: net,
          is_35a: true,
          type_35a: sel.type_35a ?? defaultType35a,
          ai_picked: true,
          ai_reason: sel.reason,
        } as LineItemDetail;
      });
  }

  // ---- Real positions present but AI didn't pick any → don't invent ----
  if (Array.isArray(invoiceLineItems) && invoiceLineItems.length > 0) {
    return [];
  }

  // ---- No positions: fall back to single custom entry (user-editable) ----
  if (!suggestedGrossAmount || suggestedGrossAmount <= 0) return [];
  const factor = vatRate > 0 ? 1 + vatRate / 100 : 1;
  const targetNet = suggestedGrossAmount / factor;
  return [
    {
      index: 0,
      description: "Lohnanteil lt. KI-Vorschlag",
      amount: parseFloat(targetNet.toFixed(2)),
      is_35a: true,
      type_35a: defaultType35a,
      is_custom: true,
    },
  ];
}
