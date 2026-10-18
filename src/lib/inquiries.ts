/**
 * Anfragen (Website, Nutzer-App, manuell) – Helfer ohne Komponenten.
 * Die Ordner im Postfach sind „virtuelle“ Ordner wie bei den Meldungen.
 */

export type InquiryFolder = "neu" | "in_bearbeitung" | "erledigt";
export type InquiryKind = "verwaltung" | "bewertung" | "suchauftrag" | "kontakt" | "objekt";

export const INQUIRY_FOLDER_IDS: Record<InquiryFolder, string> = {
  neu: "__inquiries_new__",
  in_bearbeitung: "__inquiries_progress__",
  erledigt: "__inquiries_done__",
};

export const INQUIRY_FOLDER_LABEL: Record<InquiryFolder, string> = {
  neu: "Neu",
  in_bearbeitung: "In Bearbeitung",
  erledigt: "Erledigt",
};

export const isInquiryFolderId = (id: string | null | undefined): boolean =>
  !!id && Object.values(INQUIRY_FOLDER_IDS).includes(id);

export const inquiryFolderOfId = (id: string | null | undefined): InquiryFolder | null => {
  const hit = (Object.entries(INQUIRY_FOLDER_IDS) as [InquiryFolder, string][]).find(([, v]) => v === id);
  return hit ? hit[0] : null;
};

export const KIND_LABEL: Record<InquiryKind, string> = {
  verwaltung: "Verwaltung",
  bewertung: "Bewertung",
  suchauftrag: "Suchauftrag",
  kontakt: "Kontakt",
  objekt: "Objekt-Anfrage",
};

export const SOURCE_LABEL: Record<string, string> = {
  website: "Website",
  nutzer_app: "Nutzer-App",
  manuell: "Manuell",
};

/** Bezeichnungen der Formularfelder. */
const LABELS: Record<string, string> = {
  serviceType: "Art",
  units: "Einheiten",
  garages: "Garagen / Stellplätze",
  address: "Adresse",
  location: "Ort",
  startDate: "Beginn",
  reason: "Grund",
  ownerRelation: "Verhältnis der Eigentümer",
  buildingAge: "Alter des Hauses",
  isBeirat: "Im Beirat",
  wuensche: "Wünsche",
  anliegen: "Anliegen",
  nachricht: "Nachricht",
  message: "Nachricht",
  property_title: "Objekt",
  property_address: "Objekt-Ort",
  immobilienart: "Immobilienart",
  hausart: "Hausart",
  wohnungsart: "Wohnungsart",
  gewerbeimmobilienart: "Gewerbeart",
  wohnflaeche: "Wohnfläche",
  grundstuecksflaeche: "Grundstücksfläche",
  grundstuecksgroesse: "Grundstücksgröße",
  gewerbeflaehe: "Gewerbefläche",
  nutzflaeche: "Nutzfläche",
  etage: "Etage",
  zimmeranzahl: "Zimmer",
  baujahr: "Baujahr",
  zustand: "Zustand",
  ausstattungsqualitaet: "Ausstattung",
  extras: "Extras",
  ausstattung: "Ausstattung",
  erschliessung: "Erschließung",
  bebaubarkeit: "Bebaubarkeit",
  bebauungsgebiet: "Bebauungsgebiet",
  aktuelleNutzung: "Aktuelle Nutzung",
  nutzungsart: "Nutzungsart",
  adresse: "Adresse",
  ort: "Ort",
  umkreis: "Umkreis (km)",
  kaltmiete: "Kaltmiete bis",
  bonitaet: "Bonität",
  einkommen: "Einkommen",
};

/** Verständliche Werte für Auswahlfelder. */
const WERTE: Record<string, Record<string, string>> = {
  serviceType: { weg: "WEG-Verwaltung", mv: "Mietverwaltung" },
  startDate: {
    sofort: "Sofort",
    "1-3-monate": "In 1–3 Monaten",
    "3-6-monate": "In 3–6 Monaten",
    "6-12-monate": "In 6–12 Monaten",
    "noch-offen": "Noch offen",
  },
  reason: {
    selbstverwaltung: "Bisher Selbstverwaltung",
    unzufrieden: "Unzufrieden mit der bisherigen Verwaltung",
    neubau: "Neubau – erste Verwaltung",
    anderer: "Anderer Grund",
  },
  ownerRelation: {
    gut: "Gutes Miteinander",
    gelegentlich: "Ab und zu Meinungsverschiedenheiten",
    zerstritten: "Zerstritten",
    unbekannt: "Kann ich nicht sagen",
  },
  buildingAge: {
    vor1950: "vor 1950",
    "1950-1979": "1950–1979",
    "1980-1999": "1980–1999",
    "2000-2015": "2000–2015",
    nach2015: "nach 2015",
    neubau: "Neubau",
  },
  units: { "<10": "weniger als 10", "10-50": "10 bis 50", ">50": "mehr als 50" },
};

/** Felder, die schon oben bei der Person stehen oder intern sind. */
const AUSLASSEN = new Set([
  "firstName", "lastName", "vorname", "nachname", "name", "email", "phone", "telefon",
  "datenschutz", "property_id", "broker_property_id", "hp", "website_url",
]);

function wert(key: string, v: unknown): string {
  if (v === true) return "ja";
  if (v === false) return "nein";
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => wert(key, x)).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("strasse" in o || "plz" in o || "ort" in o) {
      return [[o.strasse, o.hausnummer].filter(Boolean).join(" "), [o.plz, o.ort].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
    }
    return Object.entries(o)
      .filter(([k]) => !AUSLASSEN.has(k))
      .map(([k, x]) => wert(k, x))
      .filter(Boolean)
      .join(", ");
  }
  const s = String(v).trim();
  return WERTE[key]?.[s] ?? s;
}

/** Alle Angaben einer Anfrage als Liste „Bezeichnung → Wert“. */
export function inquiryDetails(data: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const d = data ?? {};
  // Bei der Verwaltung den Ort nicht doppelt zeigen, wenn es eine Adresse gibt.
  const hatAdresse = !!d.address;
  for (const [k, v] of Object.entries(d)) {
    if (AUSLASSEN.has(k)) continue;
    if (k === "location" && hatAdresse) continue;
    if (k === "kontakt" && v && typeof v === "object") {
      const w = (v as Record<string, unknown>).wuensche;
      if (w) out.push({ label: "Wünsche", value: String(w) });
      continue;
    }
    const value = wert(k, v);
    if (!value) continue;
    out.push({ label: LABELS[k] ?? k, value });
  }
  return out;
}

/** Kurzer Untertitel für die Liste. */
export function inquirySummary(kind: InquiryKind, data: Record<string, unknown> | null | undefined): string {
  const d = data ?? {};
  if (kind === "verwaltung") {
    const art = wert("serviceType", d.serviceType);
    const einheiten = d.units ? `${wert("units", d.units)} Einheiten` : "";
    const ort = (d.address as any)?.ort || d.location || "";
    return [art, einheiten, ort].filter(Boolean).join(" · ");
  }
  if (kind === "objekt") return String(d.property_title ?? "");
  if (kind === "bewertung") return [wert("immobilienart", d.immobilienart), (d.adresse as any)?.ort].filter(Boolean).join(" · ");
  if (kind === "suchauftrag") return [wert("immobilienart", d.immobilienart), d.ort].filter(Boolean).join(" · ");
  if (kind === "kontakt") return String(d.anliegen ?? d.nachricht ?? "").slice(0, 80);
  return "";
}

/** Herkunft (Werbekanal, Kampagne, Einstiegsseite). */
export function inquiryOrigin(attr: Record<string, unknown> | null | undefined): { label: string; value: string }[] {
  const a = attr ?? {};
  const z: [string, unknown][] = [
    ["Kanal", a.kanal],
    ["Kampagne", a.utm_campaign],
    ["Anzeige", a.utm_content],
    ["Einstiegsseite", a.landingPage],
    ["Verweisende Seite", a.referrer],
  ];
  return z.filter(([, v]) => v).map(([label, v]) => ({ label, value: String(v) }));
}
