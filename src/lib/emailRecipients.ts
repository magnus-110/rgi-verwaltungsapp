/**
 * Hilfsfunktionen für Empfänger-Listen beim Antworten auf E-Mails.
 *
 * Beim Antworten wird allen Beteiligten geantwortet: Absender + alle weiteren
 * Empfänger der Original-Mail (An), CC bleibt CC. Die eigenen Konto-Adressen
 * werden dabei herausgefiltert, damit man sich nicht selbst anschreibt.
 */

/** Holt die reine E-Mail-Adresse aus Formaten wie `Max Muster <max@example.de>`. */
export function extractEmailAddress(raw: string): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  const angle = value.match(/<([^<>]+)>/);
  const candidate = (angle ? angle[1] : value).trim().replace(/^["']|["']$/g, "");
  if (!candidate.includes("@")) return null;
  return candidate;
}

/**
 * Normalisiert Adressfelder aus der Datenbank (Json: Array oder String)
 * zu einer Liste reiner E-Mail-Adressen.
 */
export function normalizeAddressList(value: unknown): string[] {
  if (!value) return [];
  const parts: string[] = Array.isArray(value)
    ? value.map((v) => String(v))
    : String(value).split(/[,;]/);
  const out: string[] = [];
  for (const part of parts) {
    const email = extractEmailAddress(part);
    if (email) out.push(email);
  }
  return out;
}

export interface ReplyAllInput {
  /** Absender der Original-Mail */
  fromAddress?: string | null;
  /** "An"-Empfänger der Original-Mail */
  toAddresses?: unknown;
  /** "CC"-Empfänger der Original-Mail */
  ccAddresses?: unknown;
  /** Eigene Adressen (alle E-Mail-Konten), die nicht angeschrieben werden sollen */
  selfAddresses?: string[];
}

/**
 * Baut die Empfängerlisten für "Antworten an alle":
 * An = Absender + übrige An-Empfänger, CC = übrige CC-Empfänger.
 * Doppelte Adressen und eigene Konto-Adressen werden entfernt.
 */
export function buildReplyAllRecipients(input: ReplyAllInput): { to: string[]; cc: string[] } {
  const self = new Set(
    (input.selfAddresses || [])
      .map((a) => extractEmailAddress(a) || a)
      .filter(Boolean)
      .map((a) => a.toLowerCase()),
  );

  const seen = new Set<string>();
  const to: string[] = [];
  const cc: string[] = [];

  const push = (list: string[], email: string, skipSelf: boolean) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    if (skipSelf && self.has(key)) return;
    seen.add(key);
    list.push(email);
  };

  const from = extractEmailAddress(input.fromAddress || "");
  // Absender zuerst – ausser man antwortet auf eine eigene Mail, dann bleiben
  // die ursprünglichen Empfänger die Adressaten.
  if (from) push(to, from, true);

  normalizeAddressList(input.toAddresses).forEach((email) => push(to, email, true));
  normalizeAddressList(input.ccAddresses).forEach((email) => push(cc, email, true));

  // Falls alles herausgefiltert wurde (z. B. Mail nur an sich selbst), zumindest den Absender antworten
  if (to.length === 0 && cc.length === 0 && from) to.push(from);

  return { to, cc };
}
