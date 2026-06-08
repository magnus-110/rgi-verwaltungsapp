// Festtexte für Notfallkontakte am Schwarzen Brett.
// Wird sowohl im WEG-Eigentümer- als auch im Mieterportal genutzt.

export const PROPERTY_MANAGER_HINT =
  "Bitte zuerst die Hausverwaltung kontaktieren. Externe Handwerksbetriebe sollen nur dann eigenständig beauftragt werden, wenn die Hausverwaltung nicht erreichbar ist.";

export const PROPERTY_MANAGER_FALLBACK = {
  name: "RGI Immobilien GmbH & Co. KG",
  phone: "08363 960656",
  email: "info@rgi-immobilien.de",
  hours: "Während der Bürozeiten",
  whenToCall: "Für alle Schäden am Gemeinschaftseigentum während der Bürozeiten.",
};

// Mapping Gewerk → wann anrufen.
// Keys werden case-insensitive gegen service_category geprüft (mit Substring-Matching).
export const EMERGENCY_CATEGORY_INFO: Array<{
  match: string[]; // lowercase substrings die getroffen werden müssen
  whenToCall: string;
}> = [
  {
    match: ["hausmeister"],
    whenToCall:
      "Bei kleinen technischen Defekten im Haus, z. B. Lichttüren, Garten und ähnliches.",
  },
  {
    match: ["heizung", "sanitär", "sanitaer"],
    whenToCall:
      "Nur bei Totalausfall der Heizung, akuten Wasserschäden oder Rohrbruch.",
  },
  {
    match: ["rohrreinigung", "abfluss"],
    whenToCall:
      "Bei massiven Verstopfungen, wenn Abwasser in die Wohnung oder den Keller drückt.",
  },
  {
    match: ["schlüssel", "schluessel"],
    whenToCall:
      "Bei Defekten am Haustürschloss oder bei Wohnungsaussperrungen.",
  },
];

export function getCategoryHint(category: string | null | undefined): string | null {
  if (!category) return null;
  const lower = category.toLowerCase();
  for (const entry of EMERGENCY_CATEGORY_INFO) {
    if (entry.match.some((m) => lower.includes(m))) return entry.whenToCall;
  }
  return null;
}

export const PUBLIC_EMERGENCY_NUMBERS = [
  {
    label: "Feuerwehr",
    number: "112",
    whenToCall: "Rauch, Brand oder Gasgeruch",
  },
  {
    label: "Rettungsdienst",
    number: "112",
    whenToCall: "Medizinische Notfälle",
  },
  {
    label: "Polizei",
    number: "110",
    whenToCall: "Einbruch oder akute Gefahr",
  },
];
