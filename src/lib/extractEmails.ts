// Client-Pendant zu supabase/functions/_shared/sanitize-email.ts.
// WICHTIG: Die Logik muss identisch bleiben, sonst entstehen im Rundmail-Modul
// Empfänger-Schlüssel (`assignment_id|email`), die der Server nie erzeugt —
// der Empfänger würde beim Versand stillschweigend übersprungen.

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export function extractEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const cleaned = raw
    // "Name <email>" -> "email"
    .replace(/[^,;\s]*<\s*([^>]+?)\s*>/g, "$1")
    // "(...)"-Anmerkungen entfernen
    .replace(/\([^)]*\)/g, "")
    // "[...]"-Anmerkungen entfernen
    .replace(/\[[^\]]*\]/g, "");

  return cleaned
    .split(/[,;\s\/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
}

export function firstValidEmail(raw: string | null | undefined): string | null {
  return extractEmails(raw)[0] ?? null;
}
