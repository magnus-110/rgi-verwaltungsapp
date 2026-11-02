// ─────────────────────────────────────────────────────────────────────────────
// Liegenschafts-Erkennung für eingehende Rechnungen
//
// Warum es das hier gibt: Fast alle Rechnungen gehen an die Hausverwaltung
// (RGI, Vilstalstr. 4, Pfronten). Die alte Erkennung hat nur die
// Empfängeranschrift angeschaut. Lieferte die KI nur „Vilstalstr. 4, 87459
// Pfronten" (ohne „RGI Immobilien"), wurde die eigene Büroanschrift als
// Liegenschaft gelesen – und Vilstalstr. 4 liegt im Bereich 4–8 der
// „Tiefgarage Bischlhaus". Deshalb landete so vieles dort.
//
// Jetzt:
//  1. Die eigene Anschrift (Name + Straße/Hausnr.) wird aus jedem Text entfernt.
//  2. Reihenfolge der Quellen: Objekt-Hinweis der KI (Betreff, „Objekt:",
//     Leistungsort …) → Empfängeranschrift → übriger Rechnungstext.
//  3. Gleichstand zwischen zwei Gebäuden (z. B. zwei Datensätze mit derselben
//     Anschrift) führt zu keiner Zuordnung statt zu einer zufälligen.
//  4. Im Volltext zählt ein Treffer nur mit passender PLZ.
// Reine Logik ohne Datenbank – getestet in src/lib/liegenschaftErkennung.test.ts
// ─────────────────────────────────────────────────────────────────────────────

export type GebaeudeFuerErkennung = {
  id: string;
  name: string | null;
  address: string | null;
  postal_code?: string | null;
  city?: string | null;
};

export type EigeneAnschrift = {
  /** z. B. "Vilstalstr. 4" */
  strasse: string;
  /** z. B. "87459" */
  plz?: string | null;
};

export type Erkennung = {
  id: string;
  quelle: "objekt" | "empfaenger" | "volltext";
};

export function normalizeForMatch(s: string): string {
  if (!s) return "";
  let n = s.toLowerCase();
  n = n.replace(/ß/g, "ss");
  // Vereinheitliche Straßen-Suffixe: "straße"/"strasse"/"str." → "str"
  n = n.replace(/strasse/g, "str");
  n = n.replace(/str\./g, "str ");
  // Sonderzeichen → Space (behält Umlaute)
  n = n.replace(/[^a-z0-9äöü]/g, " ");
  // "<wort>str" → "<wort> str" (Ahornstr → Ahorn str)
  n = n.replace(/([a-zäöü]{2,})str\b/g, "$1 str");
  n = n.replace(/\s+/g, " ").trim();
  // "2 e" → "2e" (Hausnummer mit Buchstabe, OCR trennt gern)
  n = n.replace(/\b(\d{1,4}) ([a-h])\b/g, "$1$2");
  return n;
}

function extractPostalCodes(n: string): string[] {
  return Array.from(n.matchAll(/\b(\d{5})\b/g)).map((m) => m[1]);
}

function extractHouseNumbers(n: string): string[] {
  const out = new Set<string>();
  for (const m of n.matchAll(/\b(\d{1,4}[a-z]?)\b/g)) {
    out.add(m[1]);
  }
  return Array.from(out);
}

const SUFFIXES = ["str","weg","platz","allee","gasse","ring","damm","markt","feld","bach","tal","wehr","hof","ufer","berg","winkel","steig","pfad","chaussee","brueck","brücke"];

function extractStreetStems(n: string): string[] {
  const stems = new Set<string>();
  const tokens = n.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (SUFFIXES.includes(t) && i > 0) {
      const prev = tokens[i - 1];
      if (prev.length >= 2 && /^[a-zäöü]+$/.test(prev)) {
        stems.add(`${prev} ${t}`);
        stems.add(`${prev}${t}`);
      }
      continue;
    }
    for (const suf of SUFFIXES) {
      if (t.length > suf.length + 1 && t.endsWith(suf) && /^[a-zäöü]+$/.test(t)) {
        stems.add(t);
        const base = t.slice(0, -suf.length);
        if (base.length >= 2) stems.add(`${base} ${suf}`);
        break;
      }
    }
    // Mehrteilige Namen wie "Am Wehr", "Im Argental", "Neuer Weg", "Adolf Haff Weg"
    if (["am","im","an","auf","neuer","neue","alter","alte","zum","zur"].includes(t) && i + 2 < tokens.length) {
      const w2 = tokens[i + 1];
      const w3 = tokens[i + 2];
      if (/^[a-zäöü]+$/.test(w2) && /^\d/.test(w3)) {
        stems.add(`${t} ${w2}`);
      }
    }
  }
  return Array.from(stems);
}

// Zeilen, die zur Hausverwaltung selbst gehören (Name, z. Hd., vertreten durch …)
const EIGENER_NAME = /(rgi[\s-]*immobilien|\brgi\b|immowerk|hausverwaltung)/i;

/**
 * Entfernt die eigene Anschrift aus einem Text. Anders als früher wird nicht
 * alles ab „RGI" abgeschnitten – steht danach noch eine Objektanschrift
 * (z. B. „Rudolfstraße 2E, 87629 Füssen"), bleibt sie erhalten.
 * Eine Zeile mit der eigenen Straße fällt nur weg, wenn darin keine weitere
 * Hausnummer steht („Vilstalstr. 4-8" bleibt, „Vilstalstr. 4" fällt).
 */
export function ohneEigeneAnschrift(text: string, eigene: EigeneAnschrift[]): string {
  return bereinigteZeilen(text, eigene).join(", ");
}

function bereinigteZeilen(text: string, eigene: EigeneAnschrift[]): string[] {
  if (!text) return [];
  const eigeneNorm = eigene
    .map((e) => {
      const n = normalizeForMatch(e.strasse);
      return {
        stems: extractStreetStems(n).filter((s) => s.length >= 4),
        nummern: extractHouseNumbers(n),
      };
    })
    .filter((e) => e.stems.length > 0 && e.nummern.length > 0);

  const zeilen = text
    .split(/\r?\n|,|;/)
    .map((l) => l.trim())
    .filter(Boolean);

  const behalten = zeilen.filter((zeile) => {
    if (EIGENER_NAME.test(zeile)) {
      // „WEG Achweg 3+5 vert. d. RGI" → den Teil vor RGI behalten
      return false;
    }
    const n = normalizeForMatch(zeile);
    for (const e of eigeneNorm) {
      if (!e.stems.some((s) => n.includes(s))) continue;
      const nummern = extractHouseNumbers(n).filter((x) => !/^\d{5}$/.test(x));
      const fremde = nummern.filter((x) => !e.nummern.includes(x));
      if (nummern.length > 0 && fremde.length === 0) return false;
    }
    return true;
  });

  // Teile vor „vertreten durch RGI" in derselben Zeile retten
  const gerettet = zeilen
    .filter((z) => EIGENER_NAME.test(z))
    .map((z) => z.split(/\b(vertreten|vert\.|v\.\s*d\.|c\/o|z\.?\s*h(d)?\.?|zu\s+h[äa]nden)\b/i)[0]?.trim())
    .filter((z): z is string => !!z && !EIGENER_NAME.test(z));

  return [...gerettet, ...behalten];
}

type Bewertung = { id: string; score: number };

const WEG_ZEILE = /^\s*(weg|gdwe|reg|wohnungseigent\S*|eigent(ü|ue)mergemeinschaft)\b/i;

/** Bewertet alle Gebäude gegen einen (bereinigten) Text. */
function bewerte(text: string, gebaeude: GebaeudeFuerErkennung[], plzPflicht: boolean): Bewertung[] {
  const recv = normalizeForMatch(text);
  if (!recv) return [];
  const recvPostals = new Set(extractPostalCodes(recv));
  const recvNumbers = new Set(extractHouseNumbers(recv).filter((x) => !/^\d{5}$/.test(x)));

  const out: Bewertung[] = [];
  for (const b of gebaeude) {
    const adresse = normalizeForMatch(b.address || "");
    const name = normalizeForMatch(b.name || "");
    const stems = extractStreetStems(`${adresse} ${name}`);
    const nummern = extractHouseNumbers(adresse || name).filter((x) => !/^\d{5}$/.test(x));
    const plz = (b.postal_code || "").trim() || extractPostalCodes(adresse)[0] || null;

    let score = 0;

    // Eigenständiger Name (z. B. „Tiefgarage Bischlhaus") als starkes Signal
    if (name.length >= 8 && !/\d/.test(name) && recv.includes(name)) score += 40;

    // 1) Straßen-Stamm
    let bestStemLen = 0;
    for (const stem of stems) {
      if (stem.length >= 4 && recv.includes(stem) && stem.length > bestStemLen) bestStemLen = stem.length;
    }

    if (bestStemLen > 0) {
      // 2) Hausnummer exakt oder im Bereich (Pflicht für einen Adresstreffer)
      let nummerScore = 0;
      for (const hn of nummern) {
        if (recvNumbers.has(hn)) { nummerScore = 25; break; }
      }
      // „2e“ im Bestand, „2“ auf der Rechnung (oder umgekehrt)
      if (!nummerScore) {
        const ohneBuchstabe = (x: string) => x.replace(/[a-z]$/, "");
        const recvBasis = new Set([...recvNumbers].map(ohneBuchstabe));
        if (nummern.some((hn) => recvBasis.has(ohneBuchstabe(hn)))) nummerScore = 20;
      }
      if (!nummerScore) {
        const ranges = (b.address || "").match(/(\d{1,4})\s*[-+/]\s*(\d{1,4})/g) || [];
        outer: for (const r of ranges) {
          const m = r.match(/(\d{1,4})\s*[-+/]\s*(\d{1,4})/);
          if (!m) continue;
          const lo = parseInt(m[1]);
          const hi = parseInt(m[2]);
          for (const rn of recvNumbers) {
            const num = parseInt(rn);
            if (!isNaN(num) && num >= lo && num <= hi) { nummerScore = 18; break outer; }
          }
        }
      }
      if (nummerScore) {
        score += bestStemLen + nummerScore;
        // 3) PLZ
        if (plz && recvPostals.has(plz)) score += 15;
        else if (plzPflicht) score = 0;
      }
    }

    if (score >= 30) out.push({ id: b.id, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Bester Treffer – bei Gleichstand keiner. */
function eindeutig(bewertungen: Bewertung[]): string | null {
  if (bewertungen.length === 0) return null;
  if (bewertungen.length > 1 && bewertungen[0].score === bewertungen[1].score) return null;
  return bewertungen[0].id;
}

export function erkenneLiegenschaft(args: {
  objektHinweis?: string | null;
  empfaenger?: string | null;
  volltext?: string | null;
  gebaeude: GebaeudeFuerErkennung[];
  eigeneAnschriften: EigeneAnschrift[];
}): Erkennung | null {
  const { gebaeude, eigeneAnschriften } = args;
  const quellen: [Erkennung["quelle"], string | null | undefined, boolean][] = [
    ["objekt", args.objektHinweis, false],
    ["empfaenger", args.empfaenger, false],
    ["volltext", args.volltext, true],
  ];
  for (const [quelle, text, istVolltext] of quellen) {
    if (!text) continue;
    const zeilen = bereinigteZeilen(text, eigeneAnschriften);
    let bewertungen: Bewertung[];
    if (!istVolltext) {
      // Eine ausdrücklich genannte Gemeinschaft („WEG Achweg 3-5", „GdWE …")
      // schlägt jede andere Anschrift im selben Block (z. B. die eines Beirats).
      const wegZeilen = zeilen.filter((z) => WEG_ZEILE.test(z));
      const wegId = wegZeilen.length ? eindeutig(bewerte(wegZeilen.join(", "), gebaeude, false)) : null;
      if (wegId) return { id: wegId, quelle };
      bewertungen = bewerte(zeilen.join(", "), gebaeude, false);
    } else {
      // Im Volltext nur zusammenhängende Stellen (je 3 Zeilen) bewerten, damit
      // Straße, Hausnummer und PLZ zusammen stehen – nicht irgendeine Zahl
      // aus Beträgen oder Datumsangaben. PLZ ist hier Pflicht.
      const best = new Map<string, number>();
      for (let i = 0; i < zeilen.length; i++) {
        const fenster = zeilen.slice(i, i + 3).join(", ");
        for (const b of bewerte(fenster, gebaeude, true)) {
          if ((best.get(b.id) ?? 0) < b.score) best.set(b.id, b.score);
        }
      }
      bewertungen = [...best.entries()].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
    }
    const id = eindeutig(bewertungen);
    if (id) return { id, quelle };
  }
  return null;
}
