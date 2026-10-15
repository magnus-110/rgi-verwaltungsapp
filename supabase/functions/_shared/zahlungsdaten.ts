// Empfänger und Verwendungszweck für die Überweisung – einheitlich für
// gescannte Rechnungen, E-Rechnungen und die Nachprüfung.
//
// Empfänger: Name, der zur IBAN gehört. Hat jemand eine Rechnung mit dieser
// IBAN schon geprüft, freigegeben oder bezahlt (ggf. nach Korrektur), gilt
// dieser Name. Sonst der erkannte Name, gesäubert.
// Verwendungszweck: immer „Re. Nr. <Nummer>, <Inhalt in 1–3 Wörtern>".

const r2 = (s: string) => s.replace(/\s+/g, " ").trim();

/** OCR-Reste entfernen: Tabellenstriche, doppelte Leerzeichen, Satzzeichen am Ende. */
export function saubererName(name: string | null | undefined): string | null {
  if (!name) return null;
  let n = r2(String(name).replace(/[|*#_]+/g, " "));
  n = n.replace(/^[,;:.\-–\s]+|[,;:\-–\s]+$/g, "");
  // GROSSBUCHSTABEN-Namen lesbar machen ("HAUS UND GARTEN SERVICE")
  if (n.length > 4 && n === n.toUpperCase() && /[A-ZÄÖÜ]{4,}/.test(n)) {
    n = n.toLowerCase().replace(/(^|[\s\-/&(])([a-zäöüß])/g, (_m, a, b) => a + b.toUpperCase()).replace(/\bGmbh\b/g, "GmbH").replace(/\bKg\b/g, "KG").replace(/\bAg\b/g, "AG").replace(/\bEg\b/g, "eG");
  }
  return n || null;
}

/** Namen, die nie Empfänger einer Eingangsrechnung sind (wir selbst / die WEG). */
export function istEigenerName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /\brgi\b|rgi-immobilien|wohnungseigentümergemeinschaft|^weg\b|^weg\s|hausverwaltung\b/i.test(name);
}

const cleanIban = (i: string | null | undefined) => (i ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * Bestätigter Name zur IBAN: zuletzt geprüfte/freigegebene/bezahlte Rechnung
 * mit dieser IBAN; sonst der häufigste Name. null, wenn es die IBAN noch nicht gab.
 */
export async function nameZurIban(supabase: any, iban: string | null | undefined, ohneId?: string): Promise<string | null> {
  const i = cleanIban(iban);
  if (i.length < 15 || i.includes("X")) return null;
  let q = supabase
    .from("invoices")
    .select("id, vendor_name, vendor_iban, status, review_status, updated_at")
    .ilike("vendor_iban", `%${i.slice(-10)}%`)
    .not("vendor_name", "is", null)
    .order("updated_at", { ascending: false })
    .limit(60);
  if (ohneId) q = q.neq("id", ohneId);
  const { data } = await q;
  const gleiche = (data ?? []).filter((x: any) => cleanIban(x.vendor_iban) === i && x.vendor_name && !istEigenerName(x.vendor_name));
  if (!gleiche.length) return null;
  const bestaetigt = gleiche.find((x: any) => x.review_status === "verified" || x.status === "paid");
  if (bestaetigt) return saubererName(bestaetigt.vendor_name);
  const zaehler = new Map<string, number>();
  gleiche.forEach((x: any) => {
    const n = saubererName(x.vendor_name)!;
    zaehler.set(n, (zaehler.get(n) ?? 0) + 1);
  });
  return [...zaehler.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Empfänger festlegen: bestätigter Name zur IBAN schlägt den erkannten Namen. */
export async function empfaengerBestimmen(supabase: any, opts: { erkannt: string | null | undefined; iban: string | null | undefined; ohneId?: string }) {
  const bekannt = await nameZurIban(supabase, opts.iban, opts.ohneId);
  if (bekannt) return { name: bekannt, quelle: "iban" as const };
  const n = saubererName(opts.erkannt);
  if (n && !istEigenerName(n)) return { name: n, quelle: "erkannt" as const };
  return { name: null, quelle: "keine" as const };
}

/** Rechnungsnummer für den Verwendungszweck (technische IDs wie urn:uuid weglassen). */
export function nummerFuerZweck(nr: string | null | undefined): string | null {
  if (!nr) return null;
  const n = r2(String(nr));
  if (/^urn:|^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(n)) return null;
  return n.length > 35 ? n.slice(0, 35) : n;
}

/** Floskeln aus E-Rechnungen, die nichts über den Inhalt sagen. */
export function istFloskel(text: string | null | undefined): boolean {
  if (!text) return true;
  return /^(rechnung\b|wir bedanken|vielen dank|unsere (lieferungen|leistungen)|hiermit|sehr geehrte|gemäß|anbei|objekt\b|leistungsort|lieferadresse|baustelle|bauvorhaben|in der box)/i.test(r2(text)) || /sitz der gesellschaft|geschäftsführ|handelsregister|amtsgericht/i.test(text);
}

/** Inhalt der Rechnung in 1–3 Wörtern (KI), mit sicherem Rückfall. */
export async function kurzInhalt(
  mistralKey: string | null | undefined,
  opts: { beschreibung?: string | null; positionen?: string[]; lieferant?: string | null },
): Promise<string | null> {
  const pos = (opts.positionen ?? []).map((p) => r2(p)).filter((p) => p && !istFloskel(p)).slice(0, 12);
  const beschreibung = opts.beschreibung && !istFloskel(opts.beschreibung) ? r2(opts.beschreibung).slice(0, 400) : "";
  if (!pos.length && !beschreibung) return null;
  if (mistralKey) {
    try {
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${mistralKey}` },
        body: JSON.stringify({
          model: "mistral-small-latest",
          temperature: 0,
          max_tokens: 30,
          messages: [
            {
              role: "system",
              content:
                "Du schreibst für eine Hausverwaltung den Inhalt einer Rechnung für den Verwendungszweck einer Überweisung. " +
                "Genau 1 bis 3 Wörter, deutsch. Nimm den allgemeinen Oberbegriff der Leistung oder Ware, wie man ihn auf einen Überweisungsträger schreibt – " +
                "keine Marken-, Produkt- oder Paketnamen, keine Mengen/Stückzahlen, keine Firmennamen, keine Rechnungsnummer, kein Satzzeichen am Ende. " +
                "Monat oder Zeitraum nur bei wiederkehrenden Leistungen. Englische Produktbezeichnungen in den deutschen Oberbegriff übersetzen. " +
                "Beispiele: „Metzler Mülltonnenbox 2er Holz“ → Mülltonnenhäuschen | „immowelt Power-Paket Objekt Füssen“ → Immobilienanzeige | " +
                "„Hausmeisterpauschale September 2026“ → Hausmeister Sept 26 | „Wartung Viessmann Vitodens 200“ → Heizungswartung | " +
                "„Treppenhausreinigung wöchentlich“ → Treppenhausreinigung | „Wohngebäudeversicherung 2026“ → Gebäudeversicherung 26 | " +
                "„Stromabrechnung 10.09.2025–07.09.2026“ → Strom 25/26 | „Profilzylinder ABUS + 3 Schlüssel“ → Schließzylinder. " +
                "Antworte nur mit den Wörtern.",
            },
            {
              role: "user",
              content: [beschreibung && `Beschreibung: ${beschreibung}`, pos.length && `Positionen:\n- ${pos.join("\n- ")}`, opts.lieferant && `Lieferant (nicht nennen): ${opts.lieferant}`]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        }),
      });
      const d = await res.json();
      let t = String(d?.choices?.[0]?.message?.content ?? "").split("\n")[0];
      t = t.replace(/^["'„“\s]+|["'“”.\s]+$/g, "").replace(/^(inhalt|verwendungszweck)\s*:\s*/i, "");
      if (opts.lieferant) t = t.replace(new RegExp(opts.lieferant.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "").trim();
      const woerter = t.split(/\s+/).filter(Boolean);
      if (woerter.length) return woerter.slice(0, 3).join(" ");
    } catch (e) {
      console.error("kurzInhalt:", e);
    }
  }
  // Rückfall ohne KI: erste Position bzw. Beschreibung, max. 3 Wörter
  const quelle = pos[0] || beschreibung;
  return quelle.replace(/[(),;:].*$/, "").split(/\s+/).slice(0, 3).join(" ") || null;
}

/** „Re. Nr. XXXX, Inhalt" – fehlt etwas, nur der vorhandene Teil. */
export function verwendungszweck(nummer: string | null | undefined, inhalt: string | null | undefined): string | null {
  const n = nummerFuerZweck(nummer);
  const i = inhalt ? r2(inhalt) : "";
  if (n && i) return `Re. Nr. ${n}, ${i}`;
  if (n) return `Re. Nr. ${n}`;
  return i || null;
}

/** Hat der Verwendungszweck schon das gewünschte Format? */
export function zweckIstGut(zweck: string | null | undefined): boolean {
  return !!zweck && /^Re\. Nr\. \S.*, \S/.test(zweck) && zweck.split(",").slice(-1)[0].trim().split(/\s+/).length <= 4;
}
