import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';

/**
 * Typen für die Büro-Ablage (office_drop_items / office_drop_reads).
 *
 * Wie bei board.ts: Die Tabellen stehen noch nicht in der generierten
 * types.ts. Sobald jemand die Typen neu erzeugt, kann diese Datei entfallen
 * und `supabase` direkt verwendet werden.
 */

export type AblageKind = 'file' | 'note';
export type AblageSource = 'upload' | 'email' | 'paste';

export type AblageItemRow = {
  id: string;
  kind: AblageKind;
  note: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  source: AblageSource;
  source_email_id: string | null;
  recipient_ids: string[];
  created_by: string;
  created_at: string;
};

export type AblageReadRow = {
  item_id: string;
  user_id: string;
  read_at: string;
};

type Insertable<T, Required extends keyof T> = Partial<T> & Pick<T, Required>;

type AblageDatabase = {
  __InternalSupabase: {
    PostgrestVersion: '12.2.12 (cd3cf9e)';
  };
  public: {
    Tables: {
      office_drop_items: {
        Row: AblageItemRow;
        Insert: Insertable<AblageItemRow, 'kind'>;
        Update: Partial<AblageItemRow>;
        Relationships: [];
      };
      office_drop_reads: {
        Row: AblageReadRow;
        Insert: Insertable<AblageReadRow, 'item_id'>;
        Update: Partial<AblageReadRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export const ablageDb = supabase as unknown as SupabaseClient<AblageDatabase, 'public'>;

/** Der private Speicherbereich der Ablage. */
export const ABLAGE_BUCKET = 'office-drop';

/**
 * Eigener Datentyp beim Ziehen: Einträge aus der Ablage lassen sich so direkt
 * ins E-Mail-Fenster ziehen, Mail-Anhänge direkt in die Ablage.
 */
export const DRAG_TYPE_ABLAGE = 'application/x-rgi-ablage';
export const DRAG_TYPE_MAIL_ANHANG = 'application/x-rgi-mail-anhang';

/** Was beim Ziehen eines Ablage-Eintrags mitgegeben wird. */
export interface AblageDragFile {
  path: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  bucket: string;
}

/** Was beim Ziehen eines Mail-Anhangs mitgegeben wird. */
export interface MailAnhangDrag {
  path: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  emailId: string;
}
