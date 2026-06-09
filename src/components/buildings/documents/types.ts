export type VisibilityRole = 'intern' | 'alle' | 'personen';
export type FileSource = 'manual' | 'email' | 'invoice' | 'booking' | 'meeting';

export interface DocCategory {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  building_id: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number | null;
  is_recommended: boolean;
  auto_rag_enabled: boolean;
}

export interface DocFile {
  id: string;
  display_name: string;
  description: string | null;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  category_id: string | null;
  building_id: string | null;
  assigned_user_id: string | null;
  visibility_role: VisibilityRole;
  valid_until: string | null;
  version: number;
  parent_file_id: string | null;
  is_current_version: boolean;
  linked_contact_id: string | null;
  linked_invoice_id: string | null;
  linked_billing_period_id: string | null;
  maintenance_config_id: string | null;
  source: FileSource;
  source_email_id: string | null;
  tags: string[];
  rag_enabled: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  uploaded_by: string;
  extracted_text: string | null;
  fiscal_year: number | null;
}

export const VISIBILITY_LABELS: Record<VisibilityRole, string> = {
  intern: 'Nur Verwaltung',
  alle: 'Alle',
  personen: 'Spezifische Eigentümer',
};

/**
 * Resolve the storage bucket for a building_files row based on its source.
 * Invoice-derived rows are stored in the `invoices` bucket, everything else
 * lives in the `building-files` bucket.
 */
export function getFileBucket(source: FileSource | string | null | undefined): string {
  if (source === 'invoice') return 'invoices';
  return 'building-files';
}
