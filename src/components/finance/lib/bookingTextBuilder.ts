/**
 * Einheitlicher Buchungstext-Generator (RGI Standard).
 *
 * Schema:
 *   [Zeitraum] [Re. Nr. <invoice_number>] [Lieferant] [Gegenkonto]
 *
 * Beispiel: "09/25 Re. Nr. 8824748 Markus Gschwend Hausmeister"
 *
 * Bestandteile, die fehlen, werden weggelassen. Mehrfach-Leerzeichen werden
 * normalisiert.
 */

export type BookingTextParts = {
  /** Zeitraum-Präfix, z.B. "09/25", "Q2/25", "Jahresrechnung" */
  period?: string | null;
  /** Rechnungsnummer (ohne "Re. Nr."-Präfix) */
  invoiceNumber?: string | null;
  /** Lieferantenname aus der verknüpften Rechnung */
  vendorName?: string | null;
  /** Bezeichnung des Gegenkontos */
  counterAccountName?: string | null;
};

/**
 * Prüft, ob `currentText` noch dem zuletzt automatisch generierten Text entspricht.
 * Akzeptiert leeren Text als "auto" (noch nichts vom User geändert).
 */
export function isAutoBookingText(
  currentText: string | null | undefined,
  lastAutoSignature: string | null | undefined,
): boolean {
  const cur = (currentText || "").trim();
  if (!cur) return true;
  const sig = (lastAutoSignature || "").trim();
  if (!sig) return false;
  return cur === sig;
}

/**
 * Baut einen neuen Buchungstext, wenn der bisherige Text noch automatisch war.
 * Sonst bleibt der vom User bearbeitete Text erhalten.
 *
 * Rückgabe: { text, signature } – signature soll im Row-State als
 * `__autoTextSignature` gespeichert werden, damit künftige Vergleiche zuverlässig sind.
 */
export function rebuildBookingTextIfAuto(
  currentText: string | null | undefined,
  lastAutoSignature: string | null | undefined,
  newParts: BookingTextParts,
): { text: string; signature: string; changed: boolean } {
  const newAuto = buildBookingText(newParts);
  if (isAutoBookingText(currentText, lastAutoSignature)) {
    return { text: newAuto, signature: newAuto, changed: (currentText || "") !== newAuto };
  }
  // User-Text bleibt erhalten – Signatur trotzdem aktualisieren, damit der
  // letzte bekannte Auto-Text stets dem aktuellen Stand entspricht.
  return { text: currentText || "", signature: newAuto, changed: false };
}

export function buildBookingText(parts: BookingTextParts): string {
  const segments: string[] = [];
  const period = (parts.period || "").trim();
  const invoiceNumber = (parts.invoiceNumber || "").trim();
  const vendor = (parts.vendorName || "").trim();
  const account = (parts.counterAccountName || "").trim();

  if (period) segments.push(period);
  if (invoiceNumber) segments.push(`Re. Nr. ${invoiceNumber}`);
  if (vendor) segments.push(vendor);
  if (account) segments.push(account);

  return segments.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Berechnet das Zeitraum-Präfix aus einem Shortcut.
 *  - "1".."4"     => "Q1/YY" .. "Q4/YY"
 *  - "01".."12"   => "MM/YY"
 *  - "000"        => "Jahresrechnung"
 *
 * Jahr-Quelle: bevorzugt fiscalYear, sonst aktuelles Jahr.
 * Gibt null zurück, wenn der Shortcut nicht erkannt wird.
 */
export function periodFromShortcut(
  shortcut: string,
  fiscalYear?: number | string | null,
): string | null {
  const s = (shortcut || "").trim();
  if (!s) return null;
  const yearNum = (() => {
    const n = typeof fiscalYear === "string" ? parseInt(fiscalYear, 10) : fiscalYear;
    if (n && !isNaN(n)) return n;
    return new Date().getFullYear();
  })();
  const yy = String(yearNum).slice(-2);

  if (s === "000") return "Jahresrechnung";
  if (/^[1-4]$/.test(s)) return `Q${s}/${yy}`;
  if (/^(0[1-9]|1[0-2])$/.test(s)) return `${s}/${yy}`;
  return null;
}

/**
 * Liefert alle Vorlagen-Vorschläge, die zum aktuellen Eingabe-Token passen.
 * Wird in der Combobox dynamisch gefiltert.
 */
export function shortcutSuggestions(
  input: string,
  fiscalYear?: number | string | null,
): Array<{ shortcut: string; period: string; label: string }> {
  const q = (input || "").trim();
  const all: Array<{ shortcut: string; period: string; label: string }> = [];

  // Quartale 1-4
  for (const k of ["1", "2", "3", "4"]) {
    const p = periodFromShortcut(k, fiscalYear)!;
    all.push({ shortcut: k, period: p, label: `${k}  →  ${p}` });
  }
  // Monate 01-12
  for (let m = 1; m <= 12; m++) {
    const k = String(m).padStart(2, "0");
    const p = periodFromShortcut(k, fiscalYear)!;
    all.push({ shortcut: k, period: p, label: `${k}  →  ${p}` });
  }
  // Jahresrechnung
  all.push({ shortcut: "000", period: "Jahresrechnung", label: "000  →  Jahresrechnung" });

  if (!q) return all;
  return all.filter(s => s.shortcut.startsWith(q));
}
