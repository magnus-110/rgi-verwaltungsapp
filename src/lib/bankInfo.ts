/**
 * Kleine Helfer rund um Bankkonten für die Konten-Seite.
 *
 * Der Bankname steht in den Auszügen oft gar nicht (dort steht der
 * Kontoinhaber, z. B. „WEG Achweg 3-5"). Bei deutschen IBANs steckt die
 * Bankleitzahl an Stelle 5–12 – darüber erkennen wir die beiden Banken,
 * bei denen die WEG-Konten liegen.
 */

const BANKEN: Record<string, string> = {
  "72090000": "VR Bank Augsburg-Ostallgäu",
  "73350000": "Sparkasse Allgäu",
};

export function cleanIban(iban: string | null | undefined): string {
  return (iban ?? "").replace(/\s+/g, "").toUpperCase();
}

export function blzAusIban(iban: string | null | undefined): string | null {
  const i = cleanIban(iban);
  if (!i.startsWith("DE") || i.length !== 22) return null;
  return i.slice(4, 12);
}

export function bankName(iban: string | null | undefined, fallback?: string | null): string {
  const blz = blzAusIban(iban);
  if (blz && BANKEN[blz]) return BANKEN[blz];
  return fallback?.trim() || "Bank";
}

export function ibanFormatiert(iban: string | null | undefined): string {
  return cleanIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

export function euro(betrag: number | string | null | undefined, opts?: { vorzeichen?: boolean }): string {
  if (betrag == null || betrag === "") return "–";
  const n = Number(betrag);
  if (!Number.isFinite(n)) return "–";
  const s = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  return opts?.vorzeichen && n > 0 ? `+${s}` : s;
}

/** Betrag aus einer Sucheingabe („1.234,56", „1234.56", „-50") – oder null. */
export function betragAusSuche(q: string): number | null {
  const t = q.trim().replace(/€/g, "").replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(t)) return null;
  let norm = t;
  if (t.includes(",")) norm = t.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : null;
}
