import type { KeyTag } from "@/components/buildings/keys/types";

const pad = (v: string, len: number) => v.padStart(len, "0");

export type MatchableTag = Pick<KeyTag, "tag_number" | "key_type_id">;

/**
 * Findet Anhänger anhand einer toleranten Eingabe.
 *
 * Erkannt werden u.a.:
 *   "036-02" | "36 2" | "36/2" | "03602"  → Objekt 036, lfd. Nr. 02
 *   "K/036-02"                            → zusätzlich auf den Aufbewahrungsort-Code K eingeschränkt
 *   "036"                                 → Teiltreffer über die ganze Nummer
 *   "K"                                   → alle Anhänger dieses Aufbewahrungsorts
 *
 * Die Farbe steckt nicht in der Nummer, sondern in der Schlüsselart –
 * deshalb wird sie separat über keyTypeId eingegrenzt.
 */
export function matchTagNumber<T extends MatchableTag>(
  tags: T[],
  keyTypeId: string | null,
  raw: string,
): T[] {
  const input = (raw ?? "").trim();
  if (!input) return [];

  let pool = keyTypeId ? tags.filter((t) => t.key_type_id === keyTypeId) : tags;

  let rest = input;
  const slash = input.indexOf("/");
  if (slash >= 0) {
    const prefix = input.slice(0, slash).trim().toUpperCase();
    rest = input.slice(slash + 1);
    if (prefix) {
      pool = pool.filter((t) => (t.tag_number.split("/")[0] ?? "").toUpperCase() === prefix);
    }
  }

  const groups = rest.split(/[^0-9]+/).filter(Boolean);

  if (groups.length >= 2) {
    const suffix = `${pad(groups[groups.length - 2], 3)}-${pad(groups[groups.length - 1], 2)}`;
    return pool.filter((t) => t.tag_number.endsWith(suffix));
  }

  if (groups.length === 1) {
    const digits = groups[0];
    if (digits.length === 5) {
      const suffix = `${digits.slice(0, 3)}-${digits.slice(3)}`;
      return pool.filter((t) => t.tag_number.endsWith(suffix));
    }
    return pool.filter((t) => t.tag_number.replace(/[^0-9A-Za-z]/g, "").includes(digits));
  }

  const alpha = input.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!alpha) return [];
  return pool.filter((t) => (t.tag_number.split("/")[0] ?? "").toUpperCase() === alpha);
}
