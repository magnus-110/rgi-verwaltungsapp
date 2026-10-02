import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';

/**
 * Typen für die Meldungs-Tabellen (reports, report_events, report_participants,
 * report_steps).
 *
 * Warum hier und nicht in types.ts: Diese Datei wird von
 * `npm run db:types` erzeugt. Sobald jemand die Typen neu generiert, stehen
 * die Tabellen dort ohnehin drin — dann kann diese Datei entfallen und
 * `supabase` direkt verwendet werden (wie bei board.ts).
 *
 * Row und Insert sind bewusst `type` und nicht `interface`: nur ein type alias
 * hat eine implizite Index-Signatur, und ohne die erkennt supabase-js das
 * Schema nicht und macht aus jedem insert/update ein `never`.
 */

export type ReportRow = {
  id: string;
  report_number: string;
  management_mode: 'weg' | 'rent';
  building_id: string | null;
  title: string;
  description: string | null;
  attachments: unknown;
  reported_by: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  channel: string;
  source_email_id: string | null;
  status: string;
  current_step: string | null;
  priority: string;
  assigned_to: string | null;
  case_id: string | null;
  reply_open: boolean;
  is_read: boolean;
  has_new_reply: boolean;
  resolved_at: string | null;
  resolved_reason: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

export type ReportEventRow = {
  id: string;
  report_id: string;
  kind: string;
  body: string | null;
  step_label: string | null;
  visible_to_reporter: boolean;
  allow_reply: boolean;
  sent_by_email: boolean;
  assigned_to: string | null;
  created_by: string | null;
  attachments: unknown;
  created_at: string;
};

/** Melder einer Meldung, wenn das Büro sie für einen oder mehrere Kontakte anlegt. */
export type ReportParticipantRow = {
  report_id: string;
  contact_id: string;
  user_id: string | null;
  created_at: string;
};

export type ReportStepRow = {
  id: string;
  label: string;
  status: string;
  default_text: string;
  asks_reply: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Insertable<T, Required extends keyof T> = Partial<T> & Pick<T, Required>;

type ReportsDatabase = {
  // Muss dieselbe Form haben wie die generierte Database, sonst fällt der
  // Client auf "never" zurück.
  __InternalSupabase: {
    PostgrestVersion: '12.2.12 (cd3cf9e)';
  };
  public: {
    Tables: {
      reports: {
        Row: ReportRow;
        Insert: Insertable<ReportRow, 'management_mode' | 'title'>;
        Update: Partial<ReportRow>;
        Relationships: [];
      };
      report_events: {
        Row: ReportEventRow;
        Insert: Insertable<ReportEventRow, 'report_id' | 'kind'>;
        Update: Partial<ReportEventRow>;
        Relationships: [];
      };
      report_participants: {
        Row: ReportParticipantRow;
        Insert: Insertable<ReportParticipantRow, 'report_id' | 'contact_id'>;
        Update: Partial<ReportParticipantRow>;
        Relationships: [];
      };
      report_steps: {
        Row: ReportStepRow;
        Insert: Insertable<ReportStepRow, 'label' | 'status'>;
        Update: Partial<ReportStepRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

/** Derselbe Client, nur mit den Meldungs-Tabellen im Typ. */
export const reportsDb = supabase as unknown as SupabaseClient<ReportsDatabase, 'public'>;
