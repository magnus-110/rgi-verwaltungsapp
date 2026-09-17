/**
 * Zentrale Definitionen für Kontakt-/Adressdaten.
 *
 * Der Adress-Typ beschreibt ausschließlich die Rechtsform (natürliche Person
 * oder Firma). Ob ein Kontakt Dienstleister/Handwerker ist, wird NICHT über den
 * Typ, sondern über das Kennzeichen `is_service_provider_pool` abgebildet –
 * so kann eine Firma gleichzeitig Eigentümerin und Dienstleisterin sein.
 *
 * Der frühere Typ "service_provider" gilt als veraltet und wird überall auf
 * "company" normalisiert (siehe normalizeContactType).
 */

export const CONTACT_TYPES = [
  { value: "person", label: "Person" },
  { value: "company", label: "Firma" },
] as const;

export type ContactTypeValue = (typeof CONTACT_TYPES)[number]["value"];

/** Alter Typ "service_provider" wird auf "Firma" abgebildet. */
export function normalizeContactType(value?: string | null): ContactTypeValue {
  if (value === "company" || value === "service_provider") return "company";
  return "person";
}

export function isCompanyContactType(value?: string | null): boolean {
  return normalizeContactType(value) === "company";
}

export const SALUTATIONS = [
  "Herr",
  "Frau",
  "Eheleute",
  "Firma",
  "Familie",
  "Herr Dr.",
  "Frau Dr.",
  "Herr Prof.",
  "Frau Prof.",
  "Herr Prof. Dr.",
  "Frau Prof. Dr.",
  "Herr/Frau",
];

export const PHONE_LABELS = ["Mobil", "Festnetz", "Privat", "Büro", "Geschäftlich", "Fax"];
export const EMAIL_LABELS = ["Privat", "Geschäftlich", "Sonstige"];
