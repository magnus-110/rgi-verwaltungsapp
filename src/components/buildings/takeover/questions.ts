// Katalog der Übernahme-Fragen für das Verwaltungs-Onboarding.

export type QuestionType = "text" | "textarea" | "number" | "date" | "bool" | "select" | "multiselect";

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
  providerCategory?: string;
  options?: string[];
  allowOther?: boolean;
  /** Frage nur anzeigen, wenn andere Frage bestimmten Wert hat */
  dependsOn?:
    | { key: string; equals: any }
    | { key: string; notEquals: any }
    | { key: string; in: any[] };
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
      { key: "rundgang.hausmeister_vorhanden", label: "Gibt es einen Hausmeister?", type: "bool" },
      { key: "rundgang.hausmeister", label: "Name / Firma Hausmeister", type: "text", apply: "service_provider", providerCategory: "Hausmeister", dependsOn: { key: "rundgang.hausmeister_vorhanden", equals: true } },
      { key: "rundgang.hausmeister_vertrag", label: "Leistungsverzeichnis / Vertrag vorhanden?", type: "select", options: ["Ja", "Nein", "Teilweise"], apply: "note" },
      { key: "rundgang.winterdienst_vorhanden", label: "Gibt es einen Winterdienst?", type: "bool" },
      { key: "rundgang.winterdienst", label: "Name / Firma Winterdienst", type: "text", apply: "service_provider", providerCategory: "Winterdienst", dependsOn: { key: "rundgang.winterdienst_vorhanden", equals: true } },
      { key: "rundgang.gartenservice_vorhanden", label: "Gibt es einen Gartenservice?", type: "bool" },
      { key: "rundgang.gartenservice", label: "Name / Firma Gartenservice", type: "text", apply: "service_provider", providerCategory: "Gartenpflege", dependsOn: { key: "rundgang.gartenservice_vorhanden", equals: true } },
      { key: "rundgang.parkplaetze", label: "Parkplätze vorhanden?", type: "bool", apply: "note" },
      { key: "rundgang.parkplaetze_abrechnung", label: "Eigene Abrechnung für Parkplätze?", type: "bool", apply: "note", dependsOn: { key: "rundgang.parkplaetze", equals: true } },
      { key: "rundgang.parkplaetze_zuordnungstyp", label: "Zuordnung der Parkplätze", type: "select", options: ["Sondereigentum", "Sondernutzungsrecht", "Gemischt"], apply: "note", dependsOn: { key: "rundgang.parkplaetze", equals: true } },
      { key: "rundgang.parkplaetze_zuordnung", label: "Welche Eigentümer haben Parkplatz? (Details)", type: "textarea", apply: "note", dependsOn: { key: "rundgang.parkplaetze", equals: true } },
    ],
  },
  {
    key: "gemeinschaft",
    title: "2. Gemeinschaftseigentum / Gänge",
    questions: [
      { key: "gemeinschaft.besonderheiten", label: "Besonderheiten am Gemeinschaftseigentum", type: "textarea", apply: "note" },
      { key: "gemeinschaft.feuerloescher_vorhanden", label: "Wartungsvertrag Feuerlöscher vorhanden?", type: "bool" },
      { key: "gemeinschaft.feuerloescher_wartung", label: "Name / Firma Feuerlöscher-Wartung", type: "text", apply: "service_provider", providerCategory: "Feuerlöscher-Wartung", dependsOn: { key: "gemeinschaft.feuerloescher_vorhanden", equals: true } },
      { key: "gemeinschaft.aufzug", label: "Aufzug vorhanden?", type: "bool", apply: "note" },
      { key: "gemeinschaft.aufzug_wartung", label: "Aufzugswartung (Firma)", type: "text", apply: "service_provider", providerCategory: "Aufzugswartung", dependsOn: { key: "gemeinschaft.aufzug", equals: true } },
      { key: "gemeinschaft.lueftung", label: "Lüftungsanlage vorhanden?", type: "bool", apply: "note" },
      { key: "gemeinschaft.weitere_vertraege", label: "Weitere laufende Verträge", type: "textarea", apply: "note" },
    ],
  },
  {
    key: "heizung",
    title: "3. Heizung",
    questions: [
      { key: "heizung.art", label: "Heizungsart", type: "select", options: ["Öl", "Gas", "Wärmepumpe", "Fernwärme", "Pellets", "Sonstiges"], apply: "buildings.heating_type" },
      { key: "heizung.oel_aktuell_liter", label: "Aktueller Heizölstand in Liter", type: "number", dependsOn: { key: "heizung.art", equals: "Öl" } },
      { key: "heizung.oel_kapazitaet_liter", label: "Kapazität der Heizung in Liter", type: "number", dependsOn: { key: "heizung.art", equals: "Öl" } },
      { key: "heizung.oel_anzeige_korrekt", label: "Stimmt die Anzeige mit dem Inhalt überein?", type: "bool", apply: "note", dependsOn: { key: "heizung.art", equals: "Öl" } },
      { key: "heizung.oel_meldung", label: "Wer meldet niedrigen Heizölstand?", type: "select", options: ["Hausmeister", "Eigentümer", "Tankfirma", "Sonstiges"], allowOther: true, apply: "note", dependsOn: { key: "heizung.art", equals: "Öl" } },
      { key: "heizung.wartung_vorhanden", label: "Heizungswartungsvertrag vorhanden?", type: "bool", dependsOn: { key: "heizung.art", in: ["Öl", "Gas", "Pellets", "Wärmepumpe"] } },
      { key: "heizung.wartung", label: "Name / Firma Heizungswartung", type: "text", apply: "service_provider", providerCategory: "Heizungswartung", dependsOn: { key: "heizung.wartung_vorhanden", equals: true } },
      { key: "heizung.legionellen_letzte", label: "Letzte Legionellenprüfung", type: "date", apply: "note" },
      { key: "heizung.enthaertung", label: "Enthärtungsanlage vorhanden?", type: "bool", apply: "note" },
      { key: "heizung.funkzaehler", label: "Messzähler auf Funk umgestellt?", type: "bool", apply: "note", dependsOn: { key: "heizung.art", notEquals: "Sonstiges" } },
    ],
  },
  {
    key: "allgemein",
    title: "4. Allgemeine Verwaltung",
    questions: [
      { key: "allgemein.wj", label: "Wirtschaftsjahr", type: "select", options: ["01.01.–31.12.", "01.07.–30.06.", "Sonstiges"], allowOther: true, apply: "buildings.fiscal_year" },
      { key: "allgemein.schliessanlage", label: "Schließanlage vorhanden?", type: "bool" },
      { key: "allgemein.schliessanlage_karte", label: "Wo ist die Schließanlagen-Karte?", type: "text", apply: "note", dependsOn: { key: "allgemein.schliessanlage", equals: true } },
      { key: "allgemein.schluessel_inhaber", label: "Wer hat alles Schlüssel?", type: "textarea", apply: "note" },
      { key: "allgemein.eigentuemerkontakte", label: "Eigentümerkontaktdaten erhalten?", type: "bool", apply: "note", hint: "Import erfolgt separat über Kontakte → CSV-Import" },
      { key: "allgemein.beschlusssammlung", label: "Beschlusssammlung erhalten?", type: "bool", apply: "note" },
      { key: "allgemein.offene_beschluesse_vorhanden", label: "Gibt es offene Beschlüsse?", type: "bool" },
      { key: "allgemein.offene_beschluesse", label: "Welche offenen Beschlüsse?", type: "textarea", apply: "note", dependsOn: { key: "allgemein.offene_beschluesse_vorhanden", equals: true } },
      { key: "allgemein.te_aufteilungsplan", label: "Teilungserklärung & Aufteilungsplan erhalten?", type: "bool", apply: "note" },
      { key: "allgemein.versammlungsort", label: "Wo hat die ETV bisher stattgefunden?", type: "text", apply: "buildings.etv_default_location" },
      { key: "allgemein.dienstleister", label: "Weitere Dienstleister des Hauses", type: "textarea", apply: "note" },
      { key: "allgemein.hausordnung", label: "Hausordnung vorhanden?", type: "bool", apply: "note" },
      { key: "allgemein.angestellte_vorhanden", label: "Hat die WEG Angestellte?", type: "bool" },
      { key: "allgemein.angestellte", label: "Wer macht die Lohnbuchhaltung?", type: "text", apply: "note", dependsOn: { key: "allgemein.angestellte_vorhanden", equals: true } },
      { key: "allgemein.vermoegen_weiteres", label: "WEG-Vermögen außer Bank & Heizöl?", type: "bool" },
      { key: "allgemein.vermoegen", label: "Welches weitere Vermögen?", type: "textarea", apply: "note", dependsOn: { key: "allgemein.vermoegen_weiteres", equals: true } },
      { key: "allgemein.glaeubiger_id", label: "Gläubiger-ID des Hauses", type: "text", apply: "buildings.creditor_id" },
      { key: "allgemein.kredite_vorhanden", label: "Laufende Kredite der WEG?", type: "bool" },
      { key: "allgemein.kredite", label: "Kredite – Details", type: "textarea", apply: "note", dependsOn: { key: "allgemein.kredite_vorhanden", equals: true } },
      { key: "allgemein.ansprechpartner", label: "Hauptansprechpartner für die Hausverwaltung", type: "text", apply: "note" },
      { key: "allgemein.kassenpruefer", label: "Wer macht die Kassenprüfung?", type: "text", apply: "note" },
      { key: "allgemein.beirat", label: "Beirat – Mitglieder", type: "textarea", apply: "note" },
      { key: "allgemein.bauliche_massnahmen_geplant", label: "Sind bauliche Maßnahmen geplant?", type: "bool" },
      { key: "allgemein.bauliche_massnahmen", label: "Geplante bauliche Maßnahmen – Details", type: "textarea", apply: "note", dependsOn: { key: "allgemein.bauliche_massnahmen_geplant", equals: true } },
      { key: "allgemein.uebergabe_unterlagen", label: "Aktuelle Einzel-/Gesamtabrechnung, Kontenübersicht, Buchungsjournal erhalten?", type: "bool", apply: "note", hint: "Dokumente bitte zusätzlich im DMS ablegen" },
    ],
  },
];
