/**
 * Firmenablage von RGI Immobilien.
 *
 * Die Dateien liegen in denselben Tabellen wie die Liegenschaftsdokumente,
 * nur mit `is_company = true` und ohne Liegenschaftsbezug. Dadurch
 * funktionieren Suche, Vorschau und der DMS-Auswaehler im E-Mail-Fenster
 * ohne zweite Datenhaltung.
 */

/** Bucket, in dem die Firmendateien liegen. Praefix immer `rgi/`. */
export const COMPANY_BUCKET = "building-files";
export const COMPANY_PREFIX = "rgi";

export interface CompanyFolder {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  sort_order: number | null;
}

export interface CompanyFile {
  id: string;
  display_name: string;
  description: string | null;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  category_id: string | null;
  source: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Bucket einer Firmendatei. Angebots- und Rechnungsdateien liegen im Bucket
 * `invoices`, alles manuell Hochgeladene in `building-files`.
 */
export function companyFileBucket(source: string | null | undefined): string {
  return source === "invoice" ? "invoices" : COMPANY_BUCKET;
}

export function formatBytes(bytes: number | null | undefined): string {
  const b = bytes ?? 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
