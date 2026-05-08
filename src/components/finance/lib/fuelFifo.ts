/**
 * FIFO-Verbrauchsbewertung für Brennstoffvorräte (Heizöl, Pellets).
 *
 * Logik:
 *   Verbrauch_Menge = Anfangsbestand_Menge + Σ Zukäufe_Menge − Endbestand_Menge
 *   Verbrauch_Wert  = nach FIFO bewertet (Anfangsbestand zuerst, dann Zukäufe
 *                     in chronologischer Reihenfolge ihres entry_date).
 *
 * Restbestand-Wert = Σ noch nicht verbrauchter FIFO-Layer.
 *
 * Wird für die zweistufige Heizkosten-Umbuchung gebraucht:
 *   1410 Brennstoffkauf  → 1450 Heizölrestbestand (voller Saldo)
 *   1450 Heizölrestbestand → 1400 Heizkosten      (nur Verbrauch_Wert)
 */

export interface FuelInventoryEntry {
  entry_type: string | null;
  entry_date: string | null;
  quantity: number | string | null;
  total_price: number | string | null;
  fuel_type?: string | null;
  heating_unit_id?: string | null;
}

export interface FifoResult {
  openingQuantity: number;
  purchaseQuantity: number;
  closingQuantity: number;
  consumedQuantity: number;
  openingValueEur: number;
  purchaseValueEur: number;
  closingValueEur: number;
  /** FIFO-bewerteter Verbrauch in EUR (= Betrag, der von 1450 → 1400 umgebucht wird) */
  consumedValueEur: number;
  hasOpening: boolean;
  hasClosing: boolean;
  /** true, wenn Closing fehlt → Verbrauch nicht ermittelbar */
  missingClosing: boolean;
}

const num = (v: any): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function computeFifoConsumption(entries: FuelInventoryEntry[]): FifoResult {
  // Latest opening / closing (max entry_date)
  const openings = entries
    .filter((e) => e.entry_type === "opening_balance")
    .sort((a, b) => (a.entry_date || "").localeCompare(b.entry_date || ""));
  const closings = entries
    .filter((e) => e.entry_type === "closing_balance")
    .sort((a, b) => (a.entry_date || "").localeCompare(b.entry_date || ""));
  const purchases = entries
    .filter((e) => e.entry_type === "purchase")
    .sort((a, b) => (a.entry_date || "").localeCompare(b.entry_date || ""));

  const opening = openings[openings.length - 1];
  const closing = closings[closings.length - 1];

  const openingQuantity = opening ? num(opening.quantity) : 0;
  const openingValueEur = opening ? num(opening.total_price) : 0;
  const closingQuantity = closing ? num(closing.quantity) : 0;
  const closingValueEur = closing ? num(closing.total_price) : 0;
  const purchaseQuantity = purchases.reduce((s, p) => s + num(p.quantity), 0);
  const purchaseValueEur = purchases.reduce((s, p) => s + num(p.total_price), 0);

  const consumedQuantity = openingQuantity + purchaseQuantity - closingQuantity;

  // FIFO-Layer: opening zuerst, dann purchases chronologisch
  const layers: { qty: number; pricePerUnit: number }[] = [];
  if (opening && openingQuantity > 0) {
    layers.push({
      qty: openingQuantity,
      pricePerUnit: openingQuantity > 0 ? openingValueEur / openingQuantity : 0,
    });
  }
  purchases.forEach((p) => {
    const q = num(p.quantity);
    const v = num(p.total_price);
    if (q > 0) layers.push({ qty: q, pricePerUnit: v / q });
  });

  let remaining = Math.max(0, consumedQuantity);
  let consumedValueEur = 0;
  for (const layer of layers) {
    if (remaining <= 0) break;
    const take = Math.min(layer.qty, remaining);
    consumedValueEur += take * layer.pricePerUnit;
    layer.qty -= take;
    remaining -= take;
  }

  return {
    openingQuantity,
    purchaseQuantity,
    closingQuantity,
    consumedQuantity,
    openingValueEur,
    purchaseValueEur,
    closingValueEur,
    consumedValueEur: Math.round(consumedValueEur * 100) / 100,
    hasOpening: !!opening,
    hasClosing: !!closing,
    missingClosing: !closing,
  };
}

/**
 * Erkennt Brennstoff-Konto-Paare im Kontenrahmen.
 * Konvention: Vorratskonto = Einkaufkonto + 40 (1410↔1450, 1411↔1451, …).
 */
export interface AccountLite {
  id: string;
  account_number: string;
  account_name?: string | null;
}

export interface FuelAccountPair {
  purchase: AccountLite;
  stock: AccountLite;
}

export function findFuelAccountPairs(accounts: AccountLite[]): FuelAccountPair[] {
  const byNumber = new Map<string, AccountLite>();
  accounts.forEach((a) => byNumber.set(a.account_number, a));
  const pairs: FuelAccountPair[] = [];
  // 1410..1419 → +40
  for (let i = 0; i < 10; i++) {
    const purchaseNum = String(1410 + i);
    const stockNum = String(1450 + i);
    const purchase = byNumber.get(purchaseNum);
    const stock = byNumber.get(stockNum);
    if (purchase && stock) pairs.push({ purchase, stock });
  }
  return pairs;
}
