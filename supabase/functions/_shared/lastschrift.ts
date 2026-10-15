// Erkennt, ob eine Rechnung per Lastschrift eingezogen wird (also NICHT
// überwiesen werden darf). Zwei Stufen:
//  1. Feste Regeln auf den Sätzen, die überhaupt nach Lastschrift klingen.
//  2. KI (Mistral) nur für diese Sätze – sie trennt „wird abgebucht" von
//     Angeboten wie „Möchten Sie künftig per Lastschrift zahlen?".
// Ohne passende Sätze wird gar nicht erst gefragt (spart Kosten).

const SCHLUESSEL = /(lastschrift|abgebucht|abbuchen|abbuchung|eingezogen|einziehen|bankeinzug|einzugsverfahren|einzugserm|mandatsref|ziehen wir|buchen wir|nicht überweisen)/i;

// Angebote, Bedingungen, Zukunft, Guthaben, Mandatsformular → kein Beleg für
// einen Einzug dieser Rechnung
const ANGEBOT =
  /(möchten sie|wollen sie|wenn sie|sollten sie|falls sie|bei interesse|künftig|zukünftig|erteilen sie|erteilung|teilnehmen|teilnahme|nutzen sie|bietet ihnen|formular|einzugsermächtigung über|zurückgewiesen|zurückgegeben|zurückweist|rücklastschrift|nicht am|kein .{0,20}mandat|alternativ|informationen zur zahlung|guthaben|gutschrift|erstatt|überwiesen|auszahl|\bmir\b|\bich\b|\bmeine?[nm]?\b|bitte überweisen sie)/i;

// Ein „Satzzeichen" im Datum (12.03.2026) beendet den Satz nicht
const T = String.raw`(?:\d\.|[^.!?\n])`;
const r = (muster: string) => new RegExp(muster, "i");

// Eindeutige Formulierungen für „diese Rechnung wird eingezogen"
const SICHER = [
  r(String.raw`\b(wird|werden)\b${T}{0,220}\b(abgebucht|eingezogen|abbuchen|einziehen)`),
  r(String.raw`\b(ziehen|buchen)\s+wir\b${T}{0,220}\b(ein|ab)\b`),
  r(String.raw`\b(ziehen|buchen)\s+wir\b${T}{0,120}\b(lastschrift|mandat|vom konto|von ihrem konto|von dem uns bekannten konto)`),
  r(String.raw`\b(werden wir|wir werden)\b${T}{0,140}\b(vom|von ihrem|von folgendem|von dem uns bekannten) konto`),
  r(String.raw`\bper\s+(sepa[- ]?)?(lastschrift|abbuchung|bankeinzug)\b${T}{0,120}\b(abgebucht|eingezogen|frühestens|am\s+\d)`),
  r(String.raw`\b(zahlung|zahlungsart|zahlungsweise|zahlungsmethode|zahlungsbedingungen?|zahlart)\s*:?${T}{0,40}\b(sepa[- ]?)?(lastschrift|bankeinzug|abbuchung|einzug)\b`),
  /\blastschrift(avis|einzug erfolgt)\b/i,
  /\bbitte nicht überweisen\b/i,
];

export interface LastschriftErgebnis {
  lastschrift: boolean;
  quelle: "regel" | "ki" | "keine";
  satz: string | null;
  begruendung?: string;
}

/** Sätze (bzw. Zeilen) mit Lastschrift-Begriffen, gekürzt. */
export function kandidaten(text: string): string[] {
  const teile = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .flatMap((absatz) => (absatz.includes("|") ? absatz.split("\n") : [absatz.replace(/\n/g, " ")]))
    .flatMap((a) => a.split(/(?<=[a-zäöüß)][.!?])\s+(?=[A-ZÄÖÜ])/))
    .map((s) => s.replace(/[*#|]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 3 && SCHLUESSEL.test(s));
  return [...new Set(teile)].slice(0, 12).map((s) => (s.length > 320 ? s.slice(0, 320) : s));
}

/** Nur feste Regeln. */
export function regelPruefung(text: string): LastschriftErgebnis {
  const saetze = kandidaten(text);
  for (const s of saetze) {
    if (ANGEBOT.test(s)) continue;
    if (SICHER.some((r) => r.test(s))) return { lastschrift: true, quelle: "regel", satz: s };
  }
  // Mandatsreferenz und Gläubiger-ID im selben Satz, ohne Angebot
  for (const s of saetze) {
    if (!ANGEBOT.test(s) && /mandatsref/i.test(s) && /gl(ä|ae|a)ubiger/i.test(s)) return { lastschrift: true, quelle: "regel", satz: s };
  }
  return { lastschrift: false, quelle: "keine", satz: saetze[0] ?? null };
}

/**
 * Regeln + KI. Die KI entscheidet, wenn sie antwortet; ein sicherer
 * Regeltreffer bleibt aber gültig (die KI kann nur zusätzlich erkennen).
 */
export async function erkenneLastschrift(text: string, mistralKey?: string | null): Promise<LastschriftErgebnis> {
  const regel = regelPruefung(text ?? "");
  const saetze = kandidaten(text ?? "");
  if (!saetze.length) return regel;
  // Widerspruch im Dokument (z. B. Mahnung „bitte überweisen") → KI entscheidet
  const widerspruch = /(bitte überweisen|zu überweisen|überweisen sie)/i.test(text ?? "");
  if (!mistralKey || (regel.lastschrift && !widerspruch)) return regel;
  const ueberweisung = widerspruch ? (text.match(/[^\n.]{0,160}(bitte überweisen|zu überweisen|überweisen sie)[^\n.]{0,160}/i)?.[0] ?? "") : "";
  if (ueberweisung) saetze.push(ueberweisung.replace(/\s+/g, " ").trim());
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${mistralKey}` },
      body: JSON.stringify({
        model: "mistral-small-latest",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du prüfst Sätze aus einer Rechnung an eine Hausverwaltung. Frage: Wird der Betrag DIESER Rechnung vom Konto des Kunden " +
              "abgebucht bzw. per Lastschrift eingezogen (dann muss die Verwaltung NICHT überweisen)? " +
              "Ja bei z. B. „wird abgebucht“, „ziehen wir ein“, „Zahlungsart: Lastschrift“, „per Abbuchung“, Lastschriftavis, Kassenbon mit „SEPA Lastschrift“. " +
              "Nein bei Angeboten oder Hinweisen für die Zukunft („Möchten Sie per Lastschrift zahlen?“, „Mandat erteilen“, „Informationen zum Lastschriftverfahren“), " +
              "bei Hinweisen auf Rücklastschriften oder wenn um Überweisung gebeten wird. " +
              'Antworte nur als JSON: {"lastschrift": true|false, "satz": "der entscheidende Satz oder null", "begruendung": "ein kurzer Satz"}.',
          },
          { role: "user", content: saetze.map((s, i) => `${i + 1}. ${s}`).join("\n") },
        ],
      }),
    });
    const d = await res.json();
    const out = JSON.parse(d?.choices?.[0]?.message?.content ?? "{}");
    if (typeof out.lastschrift !== "boolean") return regel;
    return { lastschrift: out.lastschrift, quelle: "ki", satz: out.satz ? String(out.satz).slice(0, 320) : null, begruendung: out.begruendung ? String(out.begruendung).slice(0, 300) : undefined };
  } catch (e) {
    console.error("Lastschrift-KI fehlgeschlagen:", e);
    return regel;
  }
}
