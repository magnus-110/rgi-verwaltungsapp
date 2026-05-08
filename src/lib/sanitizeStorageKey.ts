/**
 * Sanitize a filename for use as a Supabase Storage object key.
 * Storage keys do not allow umlauts, ß, spaces, or other non-ASCII characters.
 * Allowed: a-z A-Z 0-9 . _ - and we collapse the rest.
 */
export function sanitizeStorageKey(fileName: string): string {
  if (!fileName) return "file";
  // Split off extension to preserve it
  const lastDot = fileName.lastIndexOf(".");
  const base = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const ext = lastDot > 0 ? fileName.slice(lastDot) : "";

  const map: Record<string, string> = {
    ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss",
  };
  const replaced = base.replace(/[äöüÄÖÜß]/g, (c) => map[c] ?? c);

  const cleanedBase = replaced
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 120);

  const cleanedExt = ext.replace(/[^a-zA-Z0-9.]+/g, "");
  return (cleanedBase || "file") + cleanedExt;
}
