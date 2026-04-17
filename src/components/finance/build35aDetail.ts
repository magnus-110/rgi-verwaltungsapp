import type { LineItemDetail, Type35a } from "./Section35aEditor";

/**
 * Builds line_items_detail entries for §35a from an AI-suggested gross amount.
 *
 * - If invoice line items exist, greedily picks items whose gross sum (with vatRate)
 *   matches the suggested amount within ±5% tolerance.
 * - Otherwise creates a single custom entry so the user immediately sees what the
 *   suggested amount represents and can edit / re-type it.
 *
 * Always returns an array suitable for storing as JSON in `line_items_detail`.
 */
export function build35aDetailFromSuggestion(
  invoiceLineItems: any[] | null | undefined,
  suggestedGrossAmount: number,
  defaultType35a: Type35a,
  vatRate: number = 19,
): LineItemDetail[] {
  if (!suggestedGrossAmount || suggestedGrossAmount <= 0) return [];

  const factor = vatRate > 0 ? 1 + vatRate / 100 : 1;
  const targetNet = suggestedGrossAmount / factor;

  // Try to match against existing OCR line items
  if (Array.isArray(invoiceLineItems) && invoiceLineItems.length > 0) {
    const itemsWithAmount = invoiceLineItems.map((item, i) => ({
      index: i,
      raw: item,
      net: parseFloat(item?.amount ?? item?.total ?? 0) || 0,
    }));

    // Greedy pick: sort desc by amount, accumulate until reaching ~target
    const sorted = [...itemsWithAmount].sort((a, b) => b.net - a.net);
    const picked: number[] = [];
    let sum = 0;
    for (const it of sorted) {
      if (it.net <= 0) continue;
      if (sum + it.net <= targetNet * 1.05) {
        picked.push(it.index);
        sum += it.net;
      }
      if (Math.abs(sum - targetNet) / targetNet <= 0.05) break;
    }

    // Accept if within 5% tolerance and at least one item picked
    if (picked.length > 0 && Math.abs(sum - targetNet) / targetNet <= 0.05) {
      return itemsWithAmount
        .filter(it => picked.includes(it.index))
        .map(it => ({
          index: it.index,
          description: it.raw?.description || it.raw?.name || `Position ${it.index + 1}`,
          amount: it.net,
          is_35a: true,
          type_35a: defaultType35a,
        }));
    }
  }

  // Fallback: custom item with the suggested net amount
  const customIndex = Array.isArray(invoiceLineItems) ? invoiceLineItems.length : 0;
  return [
    {
      index: customIndex,
      description: "Lohnanteil lt. KI-Vorschlag",
      amount: parseFloat(targetNet.toFixed(2)),
      is_35a: true,
      type_35a: defaultType35a,
      is_custom: true,
    },
  ];
}
