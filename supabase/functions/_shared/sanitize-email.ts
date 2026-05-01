// Helper: clean a stored "email" string that may contain noise like
//   "walter@gmx.de (Walter)"   -> "walter@gmx.de"
//   "a@x.de, b@x.de"           -> ["a@x.de", "b@x.de"]
//   "Max Mustermann <max@x.de>"-> "max@x.de"
// Returns array of valid email addresses (RFC 5322 simple regex).

const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export function extractEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // Replace separators (comma, semicolon, whitespace, slashes) with comma
  const cleaned = raw
    // Strip "Name <email>" -> "email"
    .replace(/[^,;\s]*<\s*([^>]+?)\s*>/g, "$1")
    // Strip "(...)" annotations
    .replace(/\([^)]*\)/g, "")
    // Strip "[...]" annotations
    .replace(/\[[^\]]*\]/g, "");

  return cleaned
    .split(/[,;\s\/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
}

export function firstValidEmail(raw: string | null | undefined): string | null {
  return extractEmails(raw)[0] ?? null;
}
