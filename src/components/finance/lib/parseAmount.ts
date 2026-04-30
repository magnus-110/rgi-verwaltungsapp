/**
 * Parses a numeric value tolerating German decimal commas ("110,23")
 * as well as thousand separators. Returns 0 for invalid / empty input.
 */
export function parseAmount(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const str = String(value).trim();
  if (!str) return 0;

  // Strip currency symbols and whitespace
  let s = str.replace(/[€$£\s]/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Assume "." is thousand sep and "," is decimal (German format)
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // English format: "," thousand, "." decimal
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
