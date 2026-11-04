// Kontakt-Schnelleinfügen im E-Mail-Text: "#" + Name tippen, Kontakt wählen,
// gewünschte Angaben anhaken, als Textblock einfügen.

export interface ContactCardPhone { number: string; label: string | null; note: string | null }
export interface ContactCardEmail { email: string; label: string | null }
export interface ContactCardPerson {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
}

export interface ContactCard {
  id: string;
  displayName: string;
  subtitle: string;
  companyName: string | null;
  personName: string | null;
  address: string | null;
  phones: ContactCardPhone[];
  emails: ContactCardEmail[];
  persons: ContactCardPerson[];
  searchText: string;
}

export interface ContactField {
  key: string;
  label: string;
  value: string;
  /** Zeile, wie sie in die Mail eingefügt wird */
  line: string;
  defaultOn: boolean;
}

/** Trigger direkt vor dem Cursor finden: "#" am Wortanfang + mind. 2 Zeichen ohne Leerzeichen. */
export function findTrigger(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|[\s([„"'])#([^\s#]{2,40})$/u);
  if (!m) return null;
  const query = m[2];
  return { start: caret - query.length - 1, query };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");

export function buildSearchText(parts: Array<string | null | undefined>): string {
  return norm(parts.filter(Boolean).join(" "));
}

/** Kontakte zur Eingabe filtern. Treffer am Wortanfang zuerst. */
export function searchContacts(cards: ContactCard[], query: string, limit = 8): ContactCard[] {
  const q = norm(query.replace(/[-_.]/g, " ")).trim();
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ c: ContactCard; s: number }> = [];
  for (const c of cards) {
    if (!tokens.every((t) => c.searchText.includes(t))) continue;
    let s = 0;
    for (const t of tokens) {
      if (new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(c.searchText)) s += 2;
    }
    if (norm(c.displayName).startsWith(tokens[0])) s += 3;
    scored.push({ c, s });
  }
  scored.sort((a, b) => b.s - a.s || a.c.displayName.localeCompare(b.c.displayName, "de"));
  return scored.slice(0, limit).map((x) => x.c);
}

/** Alle einfügbaren Angaben eines Kontakts. */
export function contactFields(c: ContactCard): ContactField[] {
  const f: ContactField[] = [];
  f.push({ key: "name", label: "Name", value: c.displayName, line: c.displayName, defaultOn: true });
  if (c.companyName && c.personName) {
    f.push({ key: "person", label: "Person", value: c.personName, line: c.personName, defaultOn: false });
  }
  c.persons.forEach((p) => {
    const detail = [p.position, p.phone, p.email].filter(Boolean).join(" · ");
    const parts = [`Ansprechpartner: ${p.name}${p.position ? ` (${p.position})` : ""}`];
    if (p.phone) parts.push(`Tel.: ${p.phone}`);
    if (p.email) parts.push(`E-Mail: ${p.email}`);
    f.push({ key: `ap:${p.id}`, label: "Ansprechpartner", value: [p.name, detail].filter(Boolean).join(" – "), line: parts.join(", "), defaultOn: false });
  });
  c.phones.forEach((p, i) => {
    const lbl = p.label?.trim() || "Telefon";
    const extra = p.note?.trim() ? ` (${p.note.trim()})` : "";
    f.push({ key: `tel:${p.number}`, label: lbl, value: p.number + extra, line: `${lbl}: ${p.number}${extra}`, defaultOn: i === 0 });
  });
  c.emails.forEach((e, i) => {
    f.push({ key: `mail:${e.email.toLowerCase()}`, label: e.label?.trim() || "E-Mail", value: e.email, line: `E-Mail: ${e.email}`, defaultOn: i === 0 });
  });
  if (c.address) f.push({ key: "adresse", label: "Adresse", value: c.address, line: c.address, defaultOn: false });
  return f;
}

const STORE_KEY = "rgi.contactInsert.v1";

function readStore(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

/** Vorauswahl: zuletzt verwendete Angaben dieses Kontakts, sonst Standard. */
export function initialSelection(c: ContactCard, fields: ContactField[]): Set<string> {
  const saved = readStore()[c.id];
  if (saved && saved.length) {
    const keys = new Set(fields.map((f) => f.key));
    const sel = saved.filter((k) => keys.has(k));
    if (sel.length) return new Set(sel);
  }
  return new Set(fields.filter((f) => f.defaultOn).map((f) => f.key));
}

export function rememberSelection(contactId: string, keys: string[]) {
  try {
    const s = readStore();
    s[contactId] = keys;
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* Speicher nicht verfügbar – egal */
  }
}

export function formatBlock(fields: ContactField[], selected: Set<string>): string {
  return fields.filter((f) => selected.has(f.key)).map((f) => f.line).join("\n");
}

/** Ersetzt "#suche" durch den Block; liefert neuen Text und Cursorposition. */
export function insertBlock(text: string, start: number, caret: number, block: string): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(caret);
  const needsNlBefore = before.length > 0 && !before.endsWith("\n") && block.includes("\n");
  const pre = needsNlBefore ? before.replace(/[ \t]+$/, "") + "\n" : before;
  const post = block.includes("\n") && after.length > 0 && !after.startsWith("\n") ? "\n" + after : after;
  const out = pre + block + post;
  return { text: out, caret: (pre + block).length };
}
