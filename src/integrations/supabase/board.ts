import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';

/**
 * Typen für die Tabellen der neuen Aufgabenansicht.
 *
 * Warum hier und nicht in types.ts: Diese Datei wird von
 * `npm run db:types` erzeugt. Alles, was man dort von Hand einträgt, ist
 * beim nächsten Lauf wieder weg. Sobald jemand die Typen neu generiert,
 * stehen board_pins und notifications dort ohnehin drin — dann kann diese
 * Datei ersatzlos entfallen und `supabase` direkt verwendet werden.
 */

export type BoardRefTypeDb = 'todo' | 'case' | 'annual_cycle_task' | 'maintenance';
export type BoardColumnKeyDb = 'wall' | 'waiting' | 'done';

export type BoardPinRow = {
  id: string;
  user_id: string;
  ref_type: BoardRefTypeDb;
  ref_id: string;
  column_key: BoardColumnKeyDb;
  waiting_for: string | null;
  note: string | null;
  sort_order: number;
  pinned_at: string;
  pinned_by: string | null;
  done_at: string | null;
}

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  ref_type: string | null;
  ref_id: string | null;
  actor_user_id: string | null;
  read_at: string | null;
  created_at: string;
}

type Insertable<T, Required extends keyof T> = Partial<T> & Pick<T, Required>;

type BoardDatabase = {
  // Muss dieselbe Form haben wie die generierte Database, sonst fällt der
  // Client auf "never" zurück und jedes insert/update wird zum Typfehler.
  __InternalSupabase: {
    PostgrestVersion: '12.2.12 (cd3cf9e)';
  };
  public: {
    Tables: {
      board_pins: {
        Row: BoardPinRow;
        Insert: Insertable<BoardPinRow, 'user_id' | 'ref_type' | 'ref_id'>;
        Update: Partial<BoardPinRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Insertable<NotificationRow, 'user_id' | 'type' | 'title'>;
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/**
 * Derselbe Client, nur mit den noch nicht generierten Tabellen im Typ.
 *
 * Row und Insert sind bewusst `type` und nicht `interface`: nur ein type alias
 * hat eine implizite Index-Signatur, und ohne die erkennt supabase-js das
 * Schema nicht und macht aus jedem insert/update ein `never`.
 */
export const boardDb = supabase as unknown as SupabaseClient<BoardDatabase, 'public'>;

/**
 * Spalten, die es in der Datenbank gibt, aber noch nicht in der generierten
 * types.ts. Wird beim Lesen als Ergänzung auf die Zeilen gelegt.
 */
export interface TodoBoardFields {
  source_type: string | null;
  source_id: string | null;
  follow_up_at: string | null;
  show_in_list_date: string | null;
  checklist_template_id: string | null;
}
