// Katalog der Übernahme-Fragen für das Verwaltungs-Onboarding.
// Jede Frage hat einen stabilen `key`, einen Typ und optional einen Apply-Target,
// damit die Antwort direkt in die zuständige Bestandstabelle übernommen werden kann.

export type QuestionType = "text" | "textarea" | "number" | "date" | "bool";

export type ApplyTarget =
  | "buildings.heating_type"
  | "buildings.creditor_id"
  | "buildings.etv_default_location"
  | "buildings.fiscal_year"
  | "buildings.general_notes"
  | "service_provider"
  | "note"
  | null;

export interface TakeoverQuestion {
  key: string;
  label: string;
  type: QuestionType;
  hint?: string;
  apply?: ApplyTarget;
  /** Bei service_provider: feste Kategorie für den Eintrag */
  providerCategory?: string;
}

export interface TakeoverSection {
  key: string;
  title: string;
  description?: string;
  questions: TakeoverQuestion[];
}

export const TAKEOVER_SECTIONS: TakeoverSection[] = [
  {
    key: "rundgang",
    title: "1. Rundgang – Parkplatz & Garten",
    questions: [
      { key: "rundgang.hausmeister", label: "Gibt es einen Hausmeister?", type: "text", apply: "service_provider", providerCategory: "Hausmeister", hint: "Name / Firma eintragen – wird als Dienstleister angelegt" },
      { key: "rundgang.hausmeister_vertrag", label: "Leistungsverzeichnis / aktueller Vertrag vorhanden?", type: "textarea", apply: "note" },
      { key: "rundgang.winterdienst", label: "Winterdienst", type: "text", apply: "service_provider", providerCategory: "Winterdienst" },
      { key: "rundgang.gartenservice", label: "Gartenservice", type: "text", apply: "service_provider", providerCategory: "Gartenpflege" },
      { key: "rundgang.parkplaetze", label: "Parkplätze vorhanden?", type: "bool", apply: "note" },
      { key: "rundgang.parkplaetze_abrechnung", label: "Bekommen die Parkplätze eine eigene Abrechnung?", type: "bool", apply: "note" },
      { key: "rundgang.parkplaetze_zuordnung", label: "Welche Eigentümer haben Parkplatz? Sondereigentum oder Sondernutzungsrecht?", type: "textarea", apply: "note" },
    ],
  },
  {
    key: "gemeinschaft",
    title: "2. Gemeinschaftseigentum / Gänge",
    questions: [
      { key: "gemeinschaft.besonderheiten", label: "Besonderheiten am Gemeinschaftseigentum", type: "textarea", apply: "note" },
      { key: "gemeinschaft.feuerloescher_wartung", label: "Wartungsvertrag Feuerlöscher", type: "text", apply: "service_provider", providerCategory: "Feuerlöscher-Wartung" },
      { key: "gemeinschaft.weitere_vertraege", label: "Weitere laufende Verträge (z. B. Aufzug, Lüftung)", type: "textarea", apply: "note" },
    ],
  },
  {
    key: "heizung",
    title: "3. Heizung",
    questions: [
      { key: "heizung.art", label: "Heizungsart (Öl, Gas, Wärmepumpe, Fernwärme …)", type: "text", apply: "buildings.heating_type" },
      { key: "heizung.oel_aktuell_liter", label: "Aktueller Heizölstand in Liter", type: "number" },
      { key: "heizung.oel_kapazitaet_liter", label: "Kapazität der Heizung in Liter", type: "number" },
      { key: "heizung.oel_anzeige_korrekt", label: "Stimmt die Anzeige mit dem Inhalt überein?", type: "bool", apply: "note" },
      { key: "heizung.oel_meldung", label: "Wer informiert die Hausverwaltung, wenn der Heizölstand niedrig ist?", type: "text", apply: "note" },
      { key: "heizung.wartung", label: "Heizungswartungsvertrag", type: "text", apply: "service_provider", providerCategory: "Heizungswartung" },
      { key: "heizung.legionellen_letzte", label: "Letzte Legionellenprüfung", type: "date", apply: "note" },
      { key: "heizung.enthaertung", label: "Enthärtungsanlage vorhanden?", type: "bool", apply: "note" },
      { key: "heizung.funkzaehler", label: "Sind die Messzähler auf Funk umgestellt?", type: "bool", apply: "note" },
    ],
  },
  {
    key: "allgemein",
    title: "4. Allgemeine Verwaltung",
    questions: [
      { key: "allgemein.wj", label: "Wirtschaftsjahr (z. B. 01.01.–31.12.)", type: "text", apply: "buildings.fiscal_year", hint: "Format: TT.MM.–TT.MM." },
      { key: "allgemein.schliessanlage", label: "Schließanlage vorhanden? Wo ist die Karte?", type: "textarea", apply: "note" },
      { key: "allgemein.schluessel_inhaber", label: "Wer hat alles Schlüssel?", type: "textarea", apply: "note" },
      { key: "allgemein.eigentuemerkontakte", label: "Eigentümerkontaktdaten erhalten?", type: "bool", apply: "note", hint: "Import erfolgt separat über Kontakte → CSV-Import" },
      { key: "allgemein.beschlusssammlung", label: "Beschlusssammlung erhalten?", type: "bool", apply: "note" },
      { key: "allgemein.te_aufteilungsplan", label: "Teilungserklärung & Aufteilungsplan erhalten?", type: "bool", apply: "note" },
      { key: "allgemein.versammlungsort", label: "Wo hat die ETV bisher stattgefunden?", type: "text", apply: "buildings.etv_default_location" },
      { key: "allgemein.dienstleister", label: "Weitere Dienstleister des Hauses", type: "textarea", apply: "note" },
      { key: "allgemein.hausordnung", label: "Hausordnung vorhanden?", type: "bool", apply: "note" },
      { key: "allgemein.angestellte", label: "Hat die WEG Angestellte? Wer macht die Lohnbuchhaltung?", type: "textarea", apply: "note" },
      { key: "allgemein.vermoegen", label: "WEG-Vermögen außer Bank & Heizöl?", type: "textarea", apply: "note" },
      { key: "allgemein.glaeubiger_id", label: "Gläubiger-ID des Hauses", type: "text", apply: "buildings.creditor_id" },
      { key: "allgemein.kredite", label: "Laufende Kredite der WEG?", type: "textarea", apply: "note" },
      { key: "allgemein.ansprechpartner", label: "Hauptansprechpartner für die Hausverwaltung", type: "text", apply: "note" },
      { key: "allgemein.kassenpruefer", label: "Wer macht die Kassenprüfung?", type: "text", apply: "note" },
      { key: "allgemein.beirat", label: "Beirat – Mitglieder", type: "textarea", apply: "note" },
      { key: "allgemein.bauliche_massnahmen", label: "Geplante bauliche Maßnahmen", type: "textarea", apply: "note" },
      { key: "allgemein.uebergabe_unterlagen", label: "Aktuelle Einzel-/Gesamtabrechnung, Kontenübersicht, Buchungsjournal erhalten?", type: "bool", apply: "note", hint: "Dokumente bitte zusätzlich im DMS ablegen" },
    ],
  },
];
