// Shared helper to normalize and generate unique usernames.
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const RESERVED = new Set([
  "admin", "administrator", "root", "support", "info", "kontakt", "contact",
  "verwalter", "verwaltung", "rgi", "system", "user", "users", "test",
  "null", "undefined", "owner", "eigentuemer", "mieter", "tenant",
]);

const UMLAUTS: Record<string, string> = {
  "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
  "Ä": "ae", "Ö": "oe", "Ü": "ue",
  "é": "e", "è": "e", "ê": "e", "à": "a", "á": "a", "â": "a",
  "ô": "o", "ó": "o", "ò": "o", "í": "i", "ì": "i", "ç": "c", "ñ": "n",
};

export function normalizeUsernamePart(s: string): string {
  if (!s) return "";
  let out = "";
  for (const ch of s) out += UMLAUTS[ch] ?? ch;
  return out
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
}

export function buildBaseUsername(firstName?: string | null, lastName?: string | null, companyName?: string | null): string {
  const fn = normalizeUsernamePart(firstName || "");
  const ln = normalizeUsernamePart(lastName || "");
  if (fn && ln) return `${fn}.${ln}`.slice(0, 40);
  if (ln) return ln;
  if (fn) return fn;
  const co = normalizeUsernamePart(companyName || "");
  if (co) return co;
  return `nutzer${Math.floor(Math.random() * 100000)}`;
}

export function isReserved(username: string): boolean {
  return RESERVED.has(username.toLowerCase());
}

export function validateUsername(username: string): { ok: boolean; error?: string } {
  if (!username || username.length < 3) return { ok: false, error: "Benutzername zu kurz (min. 3 Zeichen)" };
  if (username.length > 40) return { ok: false, error: "Benutzername zu lang (max. 40 Zeichen)" };
  if (!/^[a-z0-9._-]+$/.test(username)) return { ok: false, error: "Nur Buchstaben, Zahlen, Punkt, Bindestrich, Unterstrich erlaubt" };
  if (isReserved(username)) return { ok: false, error: "Dieser Benutzername ist reserviert" };
  return { ok: true };
}

export const USERNAME_DOMAIN = "users.rgi-immobilien.app";

export function pseudoEmail(username: string): string {
  return `${username}@${USERNAME_DOMAIN}`;
}

/** Find a unique username, appending .2, .3, ... if necessary. */
export async function ensureUniqueUsername(admin: SupabaseClient, base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  // up to 50 attempts
  for (let i = 0; i < 50; i++) {
    const { data } = await admin
      .from("profiles")
      .select("user_id")
      .eq("username", candidate)
      .maybeSingle();
    if (!data) return candidate;
    suffix++;
    candidate = `${base}.${suffix}`;
  }
  // fallback random tail
  return `${base}.${Math.floor(Math.random() * 100000)}`;
}
