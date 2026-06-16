/**
 * Zentrale Versionsverwaltung der Rechtstexte (AGB & Datenschutz).
 * Wenn die Texte ändern: Hier hochzählen — die App fordert dann automatisch eine erneute Zustimmung.
 */
export const CURRENT_LEGAL_VERSION = "2.0";

export type LegalDocType = "agb" | "datenschutz";

export const LEGAL_DOC_LABELS: Record<LegalDocType, string> = {
  agb: "Allgemeine Geschäftsbedingungen",
  datenschutz: "Datenschutzerklärung",
};
