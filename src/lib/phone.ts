/**
 * Wandelt eine beliebig formatierte Telefonnummer in einen sauberen
 * tel:-Wert (RFC 3966) für PhonerLite und andere Softphones um.
 * Die Anzeige bleibt davon unberührt – diese Funktion liefert nur den href.
 */
export function toTelHref(raw?: string | null): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\(0\)/g, ""); // deutsches "(0)" entfernen: +49 (0)170 -> +49170
  s = s.replace(/^00/, "+");   // Auslandspräfix 00 -> +
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (plus) return "tel:+" + digits;
  if (digits.startsWith("0")) return "tel:+49" + digits.slice(1);
  return "tel:+" + digits;
}
