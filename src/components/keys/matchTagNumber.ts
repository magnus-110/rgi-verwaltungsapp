import type { KeyTag } from "@/components/buildings/keys/types";

const pad = (v: string, len: number) => v.padStart(len, "0");

export type MatchableTag = Pick<KeyTag, "tag_number" | "key_type_id">;

/**
 * Formatiert eine Eingabe live in die Form der Anhängernummer
 * <Aufbewahrungsort>/<Objekt 3-stellig>-<lfd. Nr.>.
 *
 *   "36"        → "36"        (noch offen, wird nicht vorschnell aufgefüllt)
 *   "36 "       → "036-"      (Trennzeichen = Objektnummer ist fertig)
 *   "36 2"      → "036-2"
 *   "03602"     → "036-02"
 *   "k36 2"     → "K/036-2"
 *   "K/036-02"  → "K/036-02"
 *
 * Die Funktion ist auf ihrem eigenen Ergebnis stabil, lässt sich also bei
 * jedem Tastendruck erneut auf den Feldinhalt anwenden.
 */
export function formatTagInput(value: string): string {
  const up = (value ?? "").toUpperCase();

  let prefix = "";
  let rest = up;
  const slash = up.indexOf("/");
  if (slash >= 0) {
    prefix = up.slice(0, slash).replace(/[^0-9A-Z]/g, "");
    rest = up.slice(slash + 1);
  } else {
    const leading = up.match(/^([A-Z]+)(.*)$/);
    if (leading) {
      prefix = leading[1];
      rest = leading[2];
    }
  }

  const endsWithSeparator = /[^0-9A-Z]$/.test(rest);
  const groups = rest.split(/[^0-9]+/).filter(Boolean);

  let body = "";
  if (groups.length === 1) {
    const g = groups[0];
    if (g.length > 3) body = `${g.slice(0, 3)}-${g.slice(3, 5)}`;
    else if (endsWithSeparator) body = `${pad(g, 3)}-`;
    else body = g;
  } else if (groups.length > 1) {
    body = `${pad(groups[groups.length - 2], 3)}-${groups[groups.length - 1].slice(0, 2)}`;
  }

  if (!prefix) return body;
  return body ? `${prefix}/${body}` : prefix;
}

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
