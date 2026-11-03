// Verwaltervertrag: „Bestellung erfolgte“ und weitere Ausfüllstellen für rgi-render-offer.
//
// Logik „wir vorab, Rest der Kunde“:
//  - Ist im Angebot bestellung.art hinterlegt (teilungserklaerung | beschluss | umlaufbeschluss),
//    wird die Auswahl fest gedruckt (☒ bei der gewählten Option, Datum/TOP eingesetzt) – ohne Anker.
//  - Sonst: ☐ + Leerlinie + unsichtbarer Anker (weiß, 1 pt). Beim Anlegen der Unterschrift erkennt
//    _shared/signatur/felderkennung.ts die Anker und erzeugt daraus fertige Ausfüllfelder für den
//    Vertreter der GdW (ausfueller=gdw).
// Anker-Format (siehe felderkennung.ts → ankerLesen):
//   [[feld:<key>|typ=auswahl|gruppe=<g>|option=<o>|beschriftung=<text>|ausfueller=gdw|pflicht=ja]]
//   [[feld:<key>|typ=datum|abhaengig=<g>:<o>|pflicht=ja|…]]

export const BESTELLUNG_ARTEN = ["teilungserklaerung", "beschluss", "umlaufbeschluss"] as const;
export type BestellungArt = typeof BESTELLUNG_ARTEN[number];

export const BESTELLUNG_ART_TEXT: Record<BestellungArt, string> = {
  teilungserklaerung: "durch Teilungserklärung / Gemeinschaftsordnung",
  beschluss: "durch Beschluss der Eigentümerversammlung",
  umlaufbeschluss: "durch Umlaufbeschluss (§ 23 Abs. 3 WEG)",
};

const KREUZ_AN = "☒";
const KREUZ_AUS = "☐";
/** Sichtbare Leerlinien zum Ausfüllen (auch für Papier-Unterzeichner). */
const LINIE_DATUM = "______________";
const LINIE_TOP = "________";
const LINIE_TEXT = "______________________________";

/**
 * Baut einen Anker-Text. Leerzeichen werden als „_“ geschrieben: Der Anker steht in 1 pt mit
 * 1 % Zeichenbreite im PDF, pdf.js liest dort Leerzeichen nicht zuverlässig (fügt welche ein bzw.
 * verschluckt sie). Die Erkennung entfernt alle Leerzeichen und wandelt „_“ in Beschriftungen zurück.
 */
export function anker(key: string, werte: Record<string, string | boolean | number | undefined | null>): string {
  const teile = [`feld:${key}`];
  for (const [k, v] of Object.entries(werte)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    const s = v === true ? "ja" : String(v).replace(/[|\]\[_]/g, " ").trim().replace(/\s+/g, "_");
    teile.push(`${k}=${s}`);
  }
  return `[[${teile.join("|")}]]`;
}

/** Datum für den Vertrag (TT.MM.JJJJ); akzeptiert ISO und deutsches Format, sonst Text unverändert. */
function datumText(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return s;
}

/** Gewählte Art aus den Vertragswerten; Altbestand ohne bestellung.art wird aus den Daten abgeleitet. */
export function bestellungArt(d: Record<string, unknown>): BestellungArt | null {
  const a = String(d["bestellung.art"] ?? "").trim().toLowerCase();
  if ((BESTELLUNG_ARTEN as readonly string[]).includes(a)) return a as BestellungArt;
  // „offen“ = ausdrücklich offen lassen (Kunde füllt beim Unterschreiben aus)
  if (a === "offen") return null;
  if (String(d["bestellung.umlaufbeschluss_vom"] ?? "").trim()) return "umlaufbeschluss";
  if (String(d["bestellung.beschluss_vom"] ?? "").trim() || String(d["bestellung.beschluss_top"] ?? "").trim()) return "beschluss";
  if (String(d["bestellung.teilungserklaerung_vom"] ?? "").trim()) return "teilungserklaerung";
  return null;
}

/**
 * Platzhalterwerte für das Rubrum (Bestellung, vertreten durch) und die Anker der Unterschriftsfelder.
 * `vertretenDurch` = offers.object_representative.
 */
export function vertragAusfuellWerte(d: Record<string, unknown>, vertretenDurch: string | null | undefined): Record<string, string> {
  const art = bestellungArt(d);
  const v = (k: string) => String(d[k] ?? "").trim();
  const out: Record<string, string> = {};
  const G = "bestellung";
  const gdw = { ausfueller: "gdw" };

  if (art) {
    // Fest gedruckt – nur die gewählte Option angekreuzt, nur deren Angaben eingesetzt
    out["bestellung.kreuz_teilungserklaerung"] = art === "teilungserklaerung" ? KREUZ_AN : KREUZ_AUS;
    out["bestellung.kreuz_beschluss"] = art === "beschluss" ? KREUZ_AN : KREUZ_AUS;
    out["bestellung.kreuz_umlaufbeschluss"] = art === "umlaufbeschluss" ? KREUZ_AN : KREUZ_AUS;
    out["bestellung.teilungserklaerung_vom"] = art === "teilungserklaerung" ? datumText(v("bestellung.teilungserklaerung_vom")) || LINIE_DATUM : "";
    out["bestellung.beschluss_vom"] = art === "beschluss" ? datumText(v("bestellung.beschluss_vom")) || LINIE_DATUM : "";
    out["bestellung.beschluss_top"] = art === "beschluss" ? v("bestellung.beschluss_top") || LINIE_TOP : "";
    out["bestellung.umlaufbeschluss_vom"] = art === "umlaufbeschluss" ? datumText(v("bestellung.umlaufbeschluss_vom")) || LINIE_DATUM : "";
    for (const k of ["teilungserklaerung", "teilungserklaerung_vom", "beschluss", "beschluss_vom", "beschluss_top", "umlaufbeschluss", "umlaufbeschluss_vom"]) {
      out[`anker.bestellung_${k}`] = "";
    }
    // Art steht fest, aber Datum/TOP fehlen noch → nur diese Angaben füllt der Vertreter der GdW aus
    const fehlt = (k: string, key: string, text: string, typ: "datum" | "text" = "datum") => {
      if (!v(k)) out[`anker.${key}`] = anker(key, { typ, beschriftung: text, ...gdw, pflicht: true, ...(typ === "text" ? { max: 12 } : {}) });
    };
    if (art === "teilungserklaerung") fehlt("bestellung.teilungserklaerung_vom", "bestellung_teilungserklaerung_vom", "Datum der Teilungserklärung / Gemeinschaftsordnung");
    if (art === "beschluss") {
      fehlt("bestellung.beschluss_vom", "bestellung_beschluss_vom", "Datum der Eigentümerversammlung");
      fehlt("bestellung.beschluss_top", "bestellung_beschluss_top", "TOP des Beschlusses", "text");
    }
    if (art === "umlaufbeschluss") fehlt("bestellung.umlaufbeschluss_vom", "bestellung_umlaufbeschluss_vom", "Datum des Umlaufbeschlusses");
  } else {
    // Offen – der Vertreter der GdW wählt beim Unterschreiben genau eine Option
    for (const a of BESTELLUNG_ARTEN) out[`bestellung.kreuz_${a}`] = KREUZ_AUS;
    out["bestellung.teilungserklaerung_vom"] = LINIE_DATUM;
    out["bestellung.beschluss_vom"] = LINIE_DATUM;
    out["bestellung.beschluss_top"] = LINIE_TOP;
    out["bestellung.umlaufbeschluss_vom"] = LINIE_DATUM;
    const opt = (o: BestellungArt, text: string) =>
      anker(`${G}_${o}`, { typ: "auswahl", gruppe: G, option: o, beschriftung: `Bestellung ${text}`, ...gdw, pflicht: true });
    const dat = (key: string, o: BestellungArt, text: string) =>
      anker(key, { typ: "datum", beschriftung: text, ...gdw, pflicht: true, abhaengig: `${G}:${o}` });
    out["anker.bestellung_teilungserklaerung"] = opt("teilungserklaerung", "durch Teilungserklärung / Gemeinschaftsordnung");
    out["anker.bestellung_teilungserklaerung_vom"] = dat("bestellung_teilungserklaerung_vom", "teilungserklaerung", "Datum der Teilungserklärung / Gemeinschaftsordnung");
    out["anker.bestellung_beschluss"] = opt("beschluss", "durch Beschluss der Eigentümerversammlung");
    out["anker.bestellung_beschluss_vom"] = dat("bestellung_beschluss_vom", "beschluss", "Datum der Eigentümerversammlung");
    out["anker.bestellung_beschluss_top"] = anker("bestellung_beschluss_top", {
      typ: "text", beschriftung: "TOP des Beschlusses", ...gdw, pflicht: true, abhaengig: `${G}:beschluss`, max: 12,
    });
    out["anker.bestellung_umlaufbeschluss"] = opt("umlaufbeschluss", "durch Umlaufbeschluss (§ 23 Abs. 3 WEG)");
    out["anker.bestellung_umlaufbeschluss_vom"] = dat("bestellung_umlaufbeschluss_vom", "umlaufbeschluss", "Datum des Umlaufbeschlusses");
  }

  // vertreten durch: steht im Angebot ein Vertreter, wird er gedruckt; sonst Leerlinie + Textfeld (freiwillig)
  const vd = String(vertretenDurch ?? "").trim();
  out["weg.vertreten_durch"] = vd || LINIE_TEXT;
  out["anker.weg_vertreten_durch"] = vd ? "" : anker("weg_vertreten_durch", {
    typ: "text", beschriftung: "Vertreten durch (Name)", ...gdw, max: 80,
  });

  // Unterschriftsfelder: immer (für die automatische Platzierung beim Anlegen der Unterschrift)
  out["anker.unterschrift_gdw"] = anker("unterschrift_gdw", { typ: "unterschrift", beschriftung: "Vertreter der GdW", ...gdw });
  out["anker.unterschrift_rgi"] = anker("unterschrift_rgi", { typ: "unterschrift", beschriftung: "Hausverwaltung", ausfueller: "rgi" });
  return out;
}
