export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      account_balances: {
        Row: {
          account_id: string
          building_id: string
          closing_balance: number
          created_at: string
          fiscal_year: number
          id: string
          is_carried_forward: boolean
          opening_balance: number
          updated_at: string
        }
        Insert: {
          account_id: string
          building_id: string
          closing_balance?: number
          created_at?: string
          fiscal_year: number
          id?: string
          is_carried_forward?: boolean
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          building_id?: string
          closing_balance?: number
          created_at?: string
          fiscal_year?: number
          id?: string
          is_carried_forward?: boolean
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_balances_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      account_review_notes: {
        Row: {
          account_id: string
          building_id: string
          created_at: string
          fiscal_year: number
          id: string
          note: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          building_id: string
          created_at?: string
          fiscal_year: number
          id?: string
          note?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          building_id?: string
          created_at?: string
          fiscal_year?: number
          id?: string
          note?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_review_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_review_notes_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_booking_feedback: {
        Row: {
          ai_confidence_score: number | null
          ai_suggested_account_id: string | null
          ai_suggested_booking_type: string | null
          ai_suggested_counter_account_id: string | null
          bank_transaction_id: string | null
          building_id: string | null
          created_at: string
          created_by: string | null
          id: string
          management_mode: Database["public"]["Enums"]["management_mode"] | null
          rag_example_ids: string[] | null
          user_accepted: boolean | null
          user_corrected_account_id: string | null
          user_corrected_booking_type: string | null
          user_corrected_counter_account_id: string | null
        }
        Insert: {
          ai_confidence_score?: number | null
          ai_suggested_account_id?: string | null
          ai_suggested_booking_type?: string | null
          ai_suggested_counter_account_id?: string | null
          bank_transaction_id?: string | null
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          management_mode?:
            | Database["public"]["Enums"]["management_mode"]
            | null
          rag_example_ids?: string[] | null
          user_accepted?: boolean | null
          user_corrected_account_id?: string | null
          user_corrected_booking_type?: string | null
          user_corrected_counter_account_id?: string | null
        }
        Update: {
          ai_confidence_score?: number | null
          ai_suggested_account_id?: string | null
          ai_suggested_booking_type?: string | null
          ai_suggested_counter_account_id?: string | null
          bank_transaction_id?: string | null
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          management_mode?:
            | Database["public"]["Enums"]["management_mode"]
            | null
          rag_example_ids?: string[] | null
          user_accepted?: boolean | null
          user_corrected_account_id?: string | null
          user_corrected_booking_type?: string | null
          user_corrected_counter_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_booking_feedback_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_booking_feedback_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      annual_cycle_tasks: {
        Row: {
          auto_managed: boolean
          building_id: string
          completed_at: string | null
          created_at: string
          fiscal_year_end: string
          fiscal_year_start: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["annual_cycle_status"]
          task_key: string
          updated_at: string
        }
        Insert: {
          auto_managed?: boolean
          building_id: string
          completed_at?: string | null
          created_at?: string
          fiscal_year_end: string
          fiscal_year_start: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["annual_cycle_status"]
          task_key: string
          updated_at?: string
        }
        Update: {
          auto_managed?: boolean
          building_id?: string
          completed_at?: string | null
          created_at?: string
          fiscal_year_end?: string
          fiscal_year_start?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["annual_cycle_status"]
          task_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "annual_cycle_tasks_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_report_items: {
        Row: {
          amount: number
          building_id: string
          created_at: string
          created_by: string | null
          fiscal_year: number
          id: string
          label: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          amount?: number
          building_id: string
          created_at?: string
          created_by?: string | null
          fiscal_year: number
          id?: string
          label: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          building_id?: string
          created_at?: string
          created_by?: string | null
          fiscal_year?: number
          id?: string
          label?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_report_items_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliations: {
        Row: {
          bank_account_id: string
          bank_source: string | null
          building_id: string
          closing_balance_bank: number | null
          closing_balance_book: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          difference: number | null
          id: string
          notes: string | null
          opening_balance_bank: number | null
          opening_balance_book: number | null
          period_month: number
          period_year: number
          source_statement_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          bank_source?: string | null
          building_id: string
          closing_balance_bank?: number | null
          closing_balance_book?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          difference?: number | null
          id?: string
          notes?: string | null
          opening_balance_bank?: number | null
          opening_balance_book?: number | null
          period_month: number
          period_year: number
          source_statement_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          bank_source?: string | null
          building_id?: string
          closing_balance_bank?: number | null
          closing_balance_book?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          difference?: number | null
          id?: string
          notes?: string | null
          opening_balance_bank?: number | null
          opening_balance_book?: number | null
          period_month?: number
          period_year?: number
          source_statement_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_source_statement_id_fkey"
            columns: ["source_statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          account_iban: string | null
          account_name: string | null
          building_id: string | null
          closing_balance: number | null
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string | null
          fiscal_year: number
          id: string
          import_date: string
          opening_balance: number | null
          parse_warnings: Json | null
          source_format: string
          statement_date_from: string | null
          statement_date_to: string | null
        }
        Insert: {
          account_iban?: string | null
          account_name?: string | null
          building_id?: string | null
          closing_balance?: number | null
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path?: string | null
          fiscal_year?: number
          id?: string
          import_date?: string
          opening_balance?: number | null
          parse_warnings?: Json | null
          source_format?: string
          statement_date_from?: string | null
          statement_date_to?: string | null
        }
        Update: {
          account_iban?: string | null
          account_name?: string | null
          building_id?: string | null
          closing_balance?: number | null
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string | null
          fiscal_year?: number
          id?: string
          import_date?: string
          opening_balance?: number | null
          parse_warnings?: Json | null
          source_format?: string
          statement_date_from?: string | null
          statement_date_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          ai_analysis_attempted_at: string | null
          ai_analysis_attempts: number
          ai_analysis_error: string | null
          ai_analysis_status: string | null
          ai_suggestion: Json | null
          amount: number
          booked_at: string | null
          booking_date: string
          booking_id: string | null
          building_id: string | null
          created_at: string
          creditor_iban: string | null
          creditor_name: string | null
          currency: string
          debtor_iban: string | null
          debtor_name: string | null
          end_to_end_ref: string | null
          id: string
          match_status: string
          matched_invoice_id: string | null
          matched_template_id: string | null
          purpose: string | null
          statement_id: string
          transaction_hash: string | null
          value_date: string | null
        }
        Insert: {
          ai_analysis_attempted_at?: string | null
          ai_analysis_attempts?: number
          ai_analysis_error?: string | null
          ai_analysis_status?: string | null
          ai_suggestion?: Json | null
          amount: number
          booked_at?: string | null
          booking_date: string
          booking_id?: string | null
          building_id?: string | null
          created_at?: string
          creditor_iban?: string | null
          creditor_name?: string | null
          currency?: string
          debtor_iban?: string | null
          debtor_name?: string | null
          end_to_end_ref?: string | null
          id?: string
          match_status?: string
          matched_invoice_id?: string | null
          matched_template_id?: string | null
          purpose?: string | null
          statement_id: string
          transaction_hash?: string | null
          value_date?: string | null
        }
        Update: {
          ai_analysis_attempted_at?: string | null
          ai_analysis_attempts?: number
          ai_analysis_error?: string | null
          ai_analysis_status?: string | null
          ai_suggestion?: Json | null
          amount?: number
          booked_at?: string | null
          booking_date?: string
          booking_id?: string | null
          building_id?: string | null
          created_at?: string
          creditor_iban?: string | null
          creditor_name?: string | null
          currency?: string
          debtor_iban?: string | null
          debtor_name?: string | null
          end_to_end_ref?: string | null
          id?: string
          match_status?: string
          matched_invoice_id?: string | null
          matched_template_id?: string | null
          purpose?: string | null
          statement_id?: string
          transaction_hash?: string | null
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_invoice_id_fkey"
            columns: ["matched_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_template_id_fkey"
            columns: ["matched_template_id"]
            isOneToOne: false
            referencedRelation: "booking_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_periods: {
        Row: {
          building_id: string
          created_at: string
          fiscal_year: number
          heating_provider: string | null
          id: string
          notes: string | null
          period_from: string
          period_to: string
          status: string
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          fiscal_year: number
          heating_provider?: string | null
          id?: string
          notes?: string | null
          period_from: string
          period_to: string
          status?: string
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          fiscal_year?: number
          heating_provider?: string | null
          id?: string
          notes?: string | null
          period_from?: string
          period_to?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_periods_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          management_mode: string
          name: string
          scope: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          management_mode?: string
          name: string
          scope?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          management_mode?: string
          name?: string
          scope?: string
          storage_path?: string
        }
        Relationships: []
      }
      billing_validations: {
        Row: {
          actual_value: number | null
          billing_period_id: string
          check_name: string
          check_type: string
          created_at: string
          details: Json | null
          difference: number | null
          expected_value: number | null
          id: string
          message: string | null
          status: string
        }
        Insert: {
          actual_value?: number | null
          billing_period_id: string
          check_name: string
          check_type: string
          created_at?: string
          details?: Json | null
          difference?: number | null
          expected_value?: number | null
          id?: string
          message?: string | null
          status?: string
        }
        Update: {
          actual_value?: number | null
          billing_period_id?: string
          check_name?: string
          check_type?: string
          created_at?: string
          details?: Json | null
          difference?: number | null
          expected_value?: number | null
          id?: string
          message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_validations_billing_period_id_fkey"
            columns: ["billing_period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_embeddings: {
        Row: {
          account_name: string | null
          account_number: string | null
          amount: number | null
          booking_description: string | null
          booking_id: string
          booking_type: string | null
          building_id: string | null
          counter_account_name: string | null
          counter_account_number: string | null
          creditor_name: string | null
          embedded_at: string
          embedding: string
          id: string
          input_text: string
          is_35a_relevant: boolean | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          purpose_text: string | null
          source: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          amount?: number | null
          booking_description?: string | null
          booking_id: string
          booking_type?: string | null
          building_id?: string | null
          counter_account_name?: string | null
          counter_account_number?: string | null
          creditor_name?: string | null
          embedded_at?: string
          embedding: string
          id?: string
          input_text: string
          is_35a_relevant?: boolean | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          purpose_text?: string | null
          source?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          amount?: number | null
          booking_description?: string | null
          booking_id?: string
          booking_type?: string | null
          building_id?: string | null
          counter_account_name?: string | null
          counter_account_number?: string | null
          creditor_name?: string | null
          embedded_at?: string
          embedding?: string
          id?: string
          input_text?: string
          is_35a_relevant?: boolean | null
          management_mode?: Database["public"]["Enums"]["management_mode"]
          purpose_text?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_embeddings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_embeddings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_template_presets: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          interval: string | null
          is_35a_relevant: boolean | null
          name: string
          sort_order: number | null
          updated_at: string
          vat_rate: number | null
          vendor_name: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          interval?: string | null
          is_35a_relevant?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string
          vat_rate?: number | null
          vendor_name?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          interval?: string | null
          is_35a_relevant?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string
          vat_rate?: number | null
          vendor_name?: string | null
        }
        Relationships: []
      }
      booking_templates: {
        Row: {
          account_id: string | null
          amount_tolerance: number | null
          building_id: string | null
          category: string | null
          created_at: string
          description: string | null
          expected_amount: number | null
          id: string
          interval: string | null
          is_35a_relevant: boolean | null
          linked_document_id: string | null
          linked_invoice_id: string | null
          name: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          vat_rate: number | null
          vendor_iban: string | null
          vendor_name: string | null
        }
        Insert: {
          account_id?: string | null
          amount_tolerance?: number | null
          building_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          expected_amount?: number | null
          id?: string
          interval?: string | null
          is_35a_relevant?: boolean | null
          linked_document_id?: string | null
          linked_invoice_id?: string | null
          name: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number | null
          vendor_iban?: string | null
          vendor_name?: string | null
        }
        Update: {
          account_id?: string | null
          amount_tolerance?: number | null
          building_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          expected_amount?: number | null
          id?: string
          interval?: string | null
          is_35a_relevant?: boolean | null
          linked_document_id?: string | null
          linked_invoice_id?: string | null
          name?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vat_rate?: number | null
          vendor_iban?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_templates_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_templates_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "building_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_templates_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          account_id: string | null
          ai_confidence_mittel: boolean
          ai_confidence_unsicher: boolean
          ai_warning: string | null
          amount: number
          amount_35a: number | null
          bank_transaction_id: string | null
          booking_category: string | null
          booking_date: string
          booking_reference: string | null
          booking_type: string | null
          building_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          counter_account_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          fiscal_year: number
          id: string
          invoice_id: string | null
          is_35a_relevant: boolean | null
          line_items_detail: Json | null
          matched_template_id: string | null
          needs_review: boolean
          performance_period_from: string | null
          performance_period_to: string | null
          receipt_number: string | null
          review_note: string | null
          settlement_35a_type: string | null
          source: string
          source_line_index: number | null
          split_part: number | null
          split_parts_total: number | null
          status: string
          umlagefaehig: string | null
          updated_at: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          account_id?: string | null
          ai_confidence_mittel?: boolean
          ai_confidence_unsicher?: boolean
          ai_warning?: string | null
          amount: number
          amount_35a?: number | null
          bank_transaction_id?: string | null
          booking_category?: string | null
          booking_date: string
          booking_reference?: string | null
          booking_type?: string | null
          building_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          counter_account_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fiscal_year: number
          id?: string
          invoice_id?: string | null
          is_35a_relevant?: boolean | null
          line_items_detail?: Json | null
          matched_template_id?: string | null
          needs_review?: boolean
          performance_period_from?: string | null
          performance_period_to?: string | null
          receipt_number?: string | null
          review_note?: string | null
          settlement_35a_type?: string | null
          source?: string
          source_line_index?: number | null
          split_part?: number | null
          split_parts_total?: number | null
          status?: string
          umlagefaehig?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          account_id?: string | null
          ai_confidence_mittel?: boolean
          ai_confidence_unsicher?: boolean
          ai_warning?: string | null
          amount?: number
          amount_35a?: number | null
          bank_transaction_id?: string | null
          booking_category?: string | null
          booking_date?: string
          booking_reference?: string | null
          booking_type?: string | null
          building_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          counter_account_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fiscal_year?: number
          id?: string
          invoice_id?: string | null
          is_35a_relevant?: boolean | null
          line_items_detail?: Json | null
          matched_template_id?: string | null
          needs_review?: boolean
          performance_period_from?: string | null
          performance_period_to?: string | null
          receipt_number?: string | null
          review_note?: string | null
          settlement_35a_type?: string | null
          source?: string
          source_line_index?: number | null
          split_part?: number | null
          split_parts_total?: number | null
          status?: string
          umlagefaehig?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_counter_account_id_fkey"
            columns: ["counter_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_matched_template_id_fkey"
            columns: ["matched_template_id"]
            isOneToOne: false
            referencedRelation: "booking_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_lead_events: {
        Row: {
          body: string | null
          calendar_event_id: string | null
          created_at: string
          created_by: string | null
          email_id: string | null
          event_type: string
          id: string
          lead_id: string
          occurred_at: string
          title: string | null
        }
        Insert: {
          body?: string | null
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          email_id?: string | null
          event_type: string
          id?: string
          lead_id: string
          occurred_at?: string
          title?: string | null
        }
        Update: {
          body?: string | null
          calendar_event_id?: string | null
          created_at?: string
          created_by?: string | null
          email_id?: string | null
          event_type?: string
          id?: string
          lead_id?: string
          occurred_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "broker_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_leads: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          external_email: string | null
          external_name: string | null
          external_phone: string | null
          id: string
          notes: string | null
          property_id: string
          rating: number | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          external_email?: string | null
          external_name?: string | null
          external_phone?: string | null
          id?: string
          notes?: string | null
          property_id: string
          rating?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          external_email?: string | null
          external_name?: string | null
          external_phone?: string | null
          id?: string
          notes?: string | null
          property_id?: string
          rating?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "broker_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_properties: {
        Row: {
          address: string | null
          available_from: string | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          cold_rent_eur: number | null
          commission_buyer_pct: number | null
          commission_note: string | null
          commission_seller_pct: number | null
          commission_tenant_pct: number | null
          condition: string | null
          created_at: string
          created_by: string | null
          deposit_eur: number | null
          description: string | null
          energy_class: string | null
          energy_value: number | null
          features: string[]
          floor: number | null
          heating_cost_eur: number | null
          heating_type: string | null
          id: string
          internal_notes: string | null
          is_active: boolean
          listing_type: string
          living_space_sqm: number | null
          owner_contact_id: string | null
          plot_size_sqm: number | null
          postal_code: string | null
          price_eur: number | null
          primary_image_file_id: string | null
          property_type: string | null
          rooms: number | null
          service_charge_eur: number | null
          title: string
          total_floors: number | null
          updated_at: string
          year_built: number | null
        }
        Insert: {
          address?: string | null
          available_from?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          cold_rent_eur?: number | null
          commission_buyer_pct?: number | null
          commission_note?: string | null
          commission_seller_pct?: number | null
          commission_tenant_pct?: number | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          deposit_eur?: number | null
          description?: string | null
          energy_class?: string | null
          energy_value?: number | null
          features?: string[]
          floor?: number | null
          heating_cost_eur?: number | null
          heating_type?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          listing_type: string
          living_space_sqm?: number | null
          owner_contact_id?: string | null
          plot_size_sqm?: number | null
          postal_code?: string | null
          price_eur?: number | null
          primary_image_file_id?: string | null
          property_type?: string | null
          rooms?: number | null
          service_charge_eur?: number | null
          title: string
          total_floors?: number | null
          updated_at?: string
          year_built?: number | null
        }
        Update: {
          address?: string | null
          available_from?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          cold_rent_eur?: number | null
          commission_buyer_pct?: number | null
          commission_note?: string | null
          commission_seller_pct?: number | null
          commission_tenant_pct?: number | null
          condition?: string | null
          created_at?: string
          created_by?: string | null
          deposit_eur?: number | null
          description?: string | null
          energy_class?: string | null
          energy_value?: number | null
          features?: string[]
          floor?: number | null
          heating_cost_eur?: number | null
          heating_type?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          listing_type?: string
          living_space_sqm?: number | null
          owner_contact_id?: string | null
          plot_size_sqm?: number | null
          postal_code?: string | null
          price_eur?: number | null
          primary_image_file_id?: string | null
          property_type?: string | null
          rooms?: number | null
          service_charge_eur?: number | null
          title?: string
          total_floors?: number | null
          updated_at?: string
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_properties_owner_contact_id_fkey"
            columns: ["owner_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_property_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          property_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          property_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_property_notes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "broker_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      building_account_overrides: {
        Row: {
          account_id: string
          building_id: string
          created_at: string
          distribution_key: string
          id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          building_id: string
          created_at?: string
          distribution_key: string
          id?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          building_id?: string
          created_at?: string
          distribution_key?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_account_overrides_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_account_overrides_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      building_assessments: {
        Row: {
          building_id: string
          condition_rating: number | null
          contact_id: string | null
          created_at: string
          etv_location_suggestion: string | null
          id: string
          notes: string | null
          problem_areas: string[]
          source: string
          updated_at: string
          user_id: string | null
          willing_cash_audit: boolean | null
        }
        Insert: {
          building_id: string
          condition_rating?: number | null
          contact_id?: string | null
          created_at?: string
          etv_location_suggestion?: string | null
          id?: string
          notes?: string | null
          problem_areas?: string[]
          source?: string
          updated_at?: string
          user_id?: string | null
          willing_cash_audit?: boolean | null
        }
        Update: {
          building_id?: string
          condition_rating?: number | null
          contact_id?: string | null
          created_at?: string
          etv_location_suggestion?: string | null
          id?: string
          notes?: string | null
          problem_areas?: string[]
          source?: string
          updated_at?: string
          user_id?: string | null
          willing_cash_audit?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "building_assessments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_assessments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      building_bank_accounts: {
        Row: {
          bank_name: string | null
          building_id: string
          coa_account_id: string | null
          created_at: string
          display_name: string | null
          iban: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          bank_name?: string | null
          building_id: string
          coa_account_id?: string | null
          created_at?: string
          display_name?: string | null
          iban: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          bank_name?: string | null
          building_id?: string
          coa_account_id?: string | null
          created_at?: string
          display_name?: string | null
          iban?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_bank_accounts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_bank_accounts_coa_account_id_fkey"
            columns: ["coa_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      building_documents: {
        Row: {
          building_id: string | null
          category: string
          created_at: string
          document_type: string | null
          error_message: string | null
          extracted_text: string | null
          extraction_method: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          last_error: string | null
          page_count: number | null
          processed_at: string | null
          processed_pages: number | null
          processing_batch: number | null
          processing_phase: string | null
          processing_progress: number | null
          processing_step: string | null
          retry_count: number | null
          signed_url: string | null
          signed_url_expires_at: string | null
          status: string
          total_pages: number | null
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          category: string
          created_at?: string
          document_type?: string | null
          error_message?: string | null
          extracted_text?: string | null
          extraction_method?: string | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          last_error?: string | null
          page_count?: number | null
          processed_at?: string | null
          processed_pages?: number | null
          processing_batch?: number | null
          processing_phase?: string | null
          processing_progress?: number | null
          processing_step?: string | null
          retry_count?: number | null
          signed_url?: string | null
          signed_url_expires_at?: string | null
          status?: string
          total_pages?: number | null
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          category?: string
          created_at?: string
          document_type?: string | null
          error_message?: string | null
          extracted_text?: string | null
          extraction_method?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          last_error?: string | null
          page_count?: number | null
          processed_at?: string | null
          processed_pages?: number | null
          processing_batch?: number | null
          processing_phase?: string | null
          processing_progress?: number | null
          processing_step?: string | null
          retry_count?: number | null
          signed_url?: string | null
          signed_url_expires_at?: string | null
          status?: string
          total_pages?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_documents_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      building_file_activity: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          file_id: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          file_id: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          file_id?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "building_file_activity_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "building_files"
            referencedColumns: ["id"]
          },
        ]
      }
      building_file_categories: {
        Row: {
          auto_rag_enabled: boolean
          building_id: string | null
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_recommended: boolean
          management_mode: Database["public"]["Enums"]["management_mode"]
          name: string
          parent_id: string | null
          slug: string | null
          sort_order: number | null
        }
        Insert: {
          auto_rag_enabled?: boolean
          building_id?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_recommended?: boolean
          management_mode: Database["public"]["Enums"]["management_mode"]
          name: string
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
        }
        Update: {
          auto_rag_enabled?: boolean
          building_id?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_recommended?: boolean
          management_mode?: Database["public"]["Enums"]["management_mode"]
          name?: string
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "building_file_categories_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_file_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "building_file_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      building_file_visibility: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          file_id: string
          id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          file_id: string
          id?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          file_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_file_visibility_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_file_visibility_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "building_files"
            referencedColumns: ["id"]
          },
        ]
      }
      building_files: {
        Row: {
          assigned_user_id: string | null
          broker_property_id: string | null
          building_id: string | null
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          display_name: string
          extracted_text: string | null
          file_path: string
          file_size: number
          fiscal_year: number | null
          id: string
          is_current_version: boolean
          linked_billing_period_id: string | null
          linked_contact_id: string | null
          linked_invoice_id: string | null
          maintenance_config_id: string | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          mime_type: string | null
          parent_file_id: string | null
          processed_at: string | null
          processing_error: string | null
          processing_status: string
          rag_enabled: boolean
          source: Database["public"]["Enums"]["file_source"]
          source_email_id: string | null
          tags: string[]
          updated_at: string
          uploaded_by: string
          valid_until: string | null
          version: number
          visibility_role: Database["public"]["Enums"]["file_visibility_role"]
          visible_to_users: boolean
        }
        Insert: {
          assigned_user_id?: string | null
          broker_property_id?: string | null
          building_id?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_name: string
          extracted_text?: string | null
          file_path: string
          file_size?: number
          fiscal_year?: number | null
          id?: string
          is_current_version?: boolean
          linked_billing_period_id?: string | null
          linked_contact_id?: string | null
          linked_invoice_id?: string | null
          maintenance_config_id?: string | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          mime_type?: string | null
          parent_file_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          rag_enabled?: boolean
          source?: Database["public"]["Enums"]["file_source"]
          source_email_id?: string | null
          tags?: string[]
          updated_at?: string
          uploaded_by: string
          valid_until?: string | null
          version?: number
          visibility_role?: Database["public"]["Enums"]["file_visibility_role"]
          visible_to_users?: boolean
        }
        Update: {
          assigned_user_id?: string | null
          broker_property_id?: string | null
          building_id?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_name?: string
          extracted_text?: string | null
          file_path?: string
          file_size?: number
          fiscal_year?: number | null
          id?: string
          is_current_version?: boolean
          linked_billing_period_id?: string | null
          linked_contact_id?: string | null
          linked_invoice_id?: string | null
          maintenance_config_id?: string | null
          management_mode?: Database["public"]["Enums"]["management_mode"]
          mime_type?: string | null
          parent_file_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          rag_enabled?: boolean
          source?: Database["public"]["Enums"]["file_source"]
          source_email_id?: string | null
          tags?: string[]
          updated_at?: string
          uploaded_by?: string
          valid_until?: string | null
          version?: number
          visibility_role?: Database["public"]["Enums"]["file_visibility_role"]
          visible_to_users?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "building_files_broker_property_id_fkey"
            columns: ["broker_property_id"]
            isOneToOne: false
            referencedRelation: "broker_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_files_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_files_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "building_file_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_files_linked_billing_period_id_fkey"
            columns: ["linked_billing_period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_files_linked_contact_id_fkey"
            columns: ["linked_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_files_parent_file_id_fkey"
            columns: ["parent_file_id"]
            isOneToOne: false
            referencedRelation: "building_files"
            referencedColumns: ["id"]
          },
        ]
      }
      building_managers: {
        Row: {
          assigned_at: string
          building_id: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          building_id: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          building_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_managers_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_managers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      building_note_categories: {
        Row: {
          building_id: string
          created_at: string
          id: string
          label: string
          updated_at: string
          value: string
        }
        Insert: {
          building_id: string
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          value: string
        }
        Update: {
          building_id?: string
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_note_categories_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      building_notes: {
        Row: {
          building_id: string
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          building_id: string
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_notes_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      building_service_providers: {
        Row: {
          building_id: string
          category: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          source: string
          suggested_by_count: number
          updated_at: string
        }
        Insert: {
          building_id: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          source?: string
          suggested_by_count?: number
          updated_at?: string
        }
        Update: {
          building_id?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string
          suggested_by_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_service_providers_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      building_share_types: {
        Row: {
          building_id: string
          created_at: string
          id: string
          label: string
          updated_at: string
          value: string
        }
        Insert: {
          building_id: string
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          value: string
        }
        Update: {
          building_id?: string
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_share_types_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      building_takeover_answers: {
        Row: {
          applied_at: string | null
          applied_to: string | null
          building_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          question_key: string
          section: string
          status: string
          updated_at: string
          value_bool: boolean | null
          value_date: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_to?: string | null
          building_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          question_key: string
          section: string
          status?: string
          updated_at?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_to?: string | null
          building_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          question_key?: string
          section?: string
          status?: string
          updated_at?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "building_takeover_answers_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          address: string
          billing_only: boolean
          booking_instructions: string | null
          building_code: string
          created_at: string | null
          creditor_id: string | null
          etv_default_location: string | null
          fiscal_year_start_day: number
          fiscal_year_start_month: number
          general_notes: string | null
          heating_type: string | null
          id: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          management_start_date: string | null
          manager_name: string | null
          name: string
          takeover_completed_at: string | null
          type: string | null
          unit_count: number
          unit_count_for_billing: number | null
          updated_at: string | null
          welcome_letter_template_id: string | null
        }
        Insert: {
          address: string
          billing_only?: boolean
          booking_instructions?: string | null
          building_code: string
          created_at?: string | null
          creditor_id?: string | null
          etv_default_location?: string | null
          fiscal_year_start_day?: number
          fiscal_year_start_month?: number
          general_notes?: string | null
          heating_type?: string | null
          id?: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          management_start_date?: string | null
          manager_name?: string | null
          name: string
          takeover_completed_at?: string | null
          type?: string | null
          unit_count?: number
          unit_count_for_billing?: number | null
          updated_at?: string | null
          welcome_letter_template_id?: string | null
        }
        Update: {
          address?: string
          billing_only?: boolean
          booking_instructions?: string | null
          building_code?: string
          created_at?: string | null
          creditor_id?: string | null
          etv_default_location?: string | null
          fiscal_year_start_day?: number
          fiscal_year_start_month?: number
          general_notes?: string | null
          heating_type?: string | null
          id?: string
          management_mode?: Database["public"]["Enums"]["management_mode"]
          management_start_date?: string | null
          manager_name?: string | null
          name?: string
          takeover_completed_at?: string | null
          type?: string | null
          unit_count?: number
          unit_count_for_billing?: number | null
          updated_at?: string | null
          welcome_letter_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buildings_welcome_letter_template_id_fkey"
            columns: ["welcome_letter_template_id"]
            isOneToOne: false
            referencedRelation: "comm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_assignees: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_assignees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      calendar_event_buildings: {
        Row: {
          building_id: string
          created_at: string | null
          event_id: string
          id: string
        }
        Insert: {
          building_id: string
          created_at?: string | null
          event_id: string
          id?: string
        }
        Update: {
          building_id?: string
          created_at?: string | null
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_buildings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_buildings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          broker_lead_id: string | null
          broker_property_id: string | null
          category_id: string | null
          color: string | null
          created_at: string | null
          created_by: string
          description: string | null
          end_datetime: string | null
          id: string
          is_all_day: boolean | null
          is_recurring: boolean | null
          recurrence_end_date: string | null
          recurrence_interval: number | null
          recurrence_pattern: string | null
          start_datetime: string
          title: string
          todo_id: string | null
          updated_at: string | null
        }
        Insert: {
          broker_lead_id?: string | null
          broker_property_id?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          end_datetime?: string | null
          id?: string
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_pattern?: string | null
          start_datetime: string
          title: string
          todo_id?: string | null
          updated_at?: string | null
        }
        Update: {
          broker_lead_id?: string | null
          broker_property_id?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          end_datetime?: string | null
          id?: string
          is_all_day?: boolean | null
          is_recurring?: boolean | null
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_pattern?: string | null
          start_datetime?: string
          title?: string
          todo_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "todo_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "calendar_events_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          building_id: string | null
          case_id: string | null
          connected_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          direction: string
          duration_seconds: number
          ended_at: string | null
          handled: boolean
          handled_at: string | null
          id: string
          note: string | null
          number_e164: string | null
          number_raw: string | null
          started_at: string
          status: string
          transcript: string | null
        }
        Insert: {
          building_id?: string | null
          case_id?: string | null
          connected_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: string
          duration_seconds?: number
          ended_at?: string | null
          handled?: boolean
          handled_at?: string | null
          id?: string
          note?: string | null
          number_e164?: string | null
          number_raw?: string | null
          started_at?: string
          status?: string
          transcript?: string | null
        }
        Update: {
          building_id?: string | null
          case_id?: string | null
          connected_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          duration_seconds?: number
          ended_at?: string | null
          handled?: boolean
          handled_at?: string | null
          id?: string
          note?: string | null
          number_e164?: string | null
          number_raw?: string | null
          started_at?: string
          status?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          attachments: Json
          body: string | null
          building_id: string
          case_id: string
          created_at: string
          created_by: string
          event_type: Database["public"]["Enums"]["case_event_type"]
          extracted_data: Json
          id: string
          occurred_at: string
          parent_event_id: string | null
          source_id: string | null
          source_table: string | null
          title: string | null
        }
        Insert: {
          attachments?: Json
          body?: string | null
          building_id: string
          case_id: string
          created_at?: string
          created_by: string
          event_type: Database["public"]["Enums"]["case_event_type"]
          extracted_data?: Json
          id?: string
          occurred_at?: string
          parent_event_id?: string | null
          source_id?: string | null
          source_table?: string | null
          title?: string | null
        }
        Update: {
          attachments?: Json
          body?: string | null
          building_id?: string
          case_id?: string
          created_at?: string
          created_by?: string
          event_type?: Database["public"]["Enums"]["case_event_type"]
          extracted_data?: Json
          id?: string
          occurred_at?: string
          parent_event_id?: string | null
          source_id?: string | null
          source_table?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_events_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "case_events"
            referencedColumns: ["id"]
          },
        ]
      }
      case_participants: {
        Row: {
          case_id: string
          contact_id: string | null
          created_at: string
          display_name: string | null
          id: string
          notes: string | null
          role: Database["public"]["Enums"]["case_participant_role"]
        }
        Insert: {
          case_id: string
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          notes?: string | null
          role?: Database["public"]["Enums"]["case_participant_role"]
        }
        Update: {
          case_id?: string
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          notes?: string | null
          role?: Database["public"]["Enums"]["case_participant_role"]
        }
        Relationships: [
          {
            foreignKeyName: "case_participants_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_participants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          ai_keywords: string[]
          ai_next_steps: Json
          ai_summary: string | null
          ai_summary_updated_at: string | null
          assignee_user_id: string | null
          building_id: string
          category: Database["public"]["Enums"]["case_category"]
          closed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          external_refs: Json
          id: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          priority: Database["public"]["Enums"]["case_priority"]
          status: Database["public"]["Enums"]["case_status"]
          title: string
          unit_number: string | null
          updated_at: string
        }
        Insert: {
          ai_keywords?: string[]
          ai_next_steps?: Json
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          assignee_user_id?: string | null
          building_id: string
          category?: Database["public"]["Enums"]["case_category"]
          closed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          external_refs?: Json
          id?: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          priority?: Database["public"]["Enums"]["case_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          title: string
          unit_number?: string | null
          updated_at?: string
        }
        Update: {
          ai_keywords?: string[]
          ai_next_steps?: Json
          ai_summary?: string | null
          ai_summary_updated_at?: string | null
          assignee_user_id?: string | null
          building_id?: string
          category?: Database["public"]["Enums"]["case_category"]
          closed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          external_refs?: Json
          id?: string
          management_mode?: Database["public"]["Enums"]["management_mode"]
          priority?: Database["public"]["Enums"]["case_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          title?: string
          unit_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cases_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_audit_notes: {
        Row: {
          body: string
          cash_audit_id: string
          created_at: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          body: string
          cash_audit_id: string
          created_at?: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          body?: string
          cash_audit_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_audit_notes_cash_audit_id_fkey"
            columns: ["cash_audit_id"]
            isOneToOne: false
            referencedRelation: "cash_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_audit_statements: {
        Row: {
          cash_audit_id: string
          category: string
          file_name: string
          file_path: string
          id: string
          sort_order: number
          uploaded_at: string
        }
        Insert: {
          cash_audit_id: string
          category?: string
          file_name: string
          file_path: string
          id?: string
          sort_order?: number
          uploaded_at?: string
        }
        Update: {
          cash_audit_id?: string
          category?: string
          file_name?: string
          file_path?: string
          id?: string
          sort_order?: number
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_audit_statements_cash_audit_id_fkey"
            columns: ["cash_audit_id"]
            isOneToOne: false
            referencedRelation: "cash_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_audits: {
        Row: {
          access_token: string | null
          auditor_contact_id: string | null
          auditor_name_override: string | null
          billing_period_id: string
          building_id: string
          completed_at: string | null
          created_at: string
          fiscal_year: number
          id: string
          notes: string | null
          progress: Json
          signature_data: string | null
          signed_at: string | null
          status: string
          updated_at: string
          visible_in_portal_until: string | null
        }
        Insert: {
          access_token?: string | null
          auditor_contact_id?: string | null
          auditor_name_override?: string | null
          billing_period_id: string
          building_id: string
          completed_at?: string | null
          created_at?: string
          fiscal_year: number
          id?: string
          notes?: string | null
          progress?: Json
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          updated_at?: string
          visible_in_portal_until?: string | null
        }
        Update: {
          access_token?: string | null
          auditor_contact_id?: string | null
          auditor_name_override?: string | null
          billing_period_id?: string
          building_id?: string
          completed_at?: string | null
          created_at?: string
          fiscal_year?: number
          id?: string
          notes?: string | null
          progress?: Json
          signature_data?: string | null
          signed_at?: string | null
          status?: string
          updated_at?: string
          visible_in_portal_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_audits_auditor_contact_id_fkey"
            columns: ["auditor_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_audits_billing_period_id_fkey"
            columns: ["billing_period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_audits_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_name: string
          account_number: string
          building_id: string | null
          carry_forward_balance: boolean
          category: string
          created_at: string
          default_distribution_key: string | null
          default_vat_rate: number | null
          id: string
          is_35a_relevant: boolean | null
          is_asset_report_relevant: boolean
          is_billing_relevant: boolean
          is_distributable: boolean
          is_heating_relevant: boolean
          is_reserve_funded: boolean
          is_system_account: boolean | null
          is_wirtschaftsplan_relevant: boolean
          reserve_role: string | null
          settlement_35a_type: string | null
          settlement_section: string | null
          sort_order: number | null
          umlagefaehig: boolean
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          building_id?: string | null
          carry_forward_balance?: boolean
          category: string
          created_at?: string
          default_distribution_key?: string | null
          default_vat_rate?: number | null
          id?: string
          is_35a_relevant?: boolean | null
          is_asset_report_relevant?: boolean
          is_billing_relevant?: boolean
          is_distributable?: boolean
          is_heating_relevant?: boolean
          is_reserve_funded?: boolean
          is_system_account?: boolean | null
          is_wirtschaftsplan_relevant?: boolean
          reserve_role?: string | null
          settlement_35a_type?: string | null
          settlement_section?: string | null
          sort_order?: number | null
          umlagefaehig?: boolean
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          building_id?: string | null
          carry_forward_balance?: boolean
          category?: string
          created_at?: string
          default_distribution_key?: string | null
          default_vat_rate?: number | null
          id?: string
          is_35a_relevant?: boolean | null
          is_asset_report_relevant?: boolean
          is_billing_relevant?: boolean
          is_distributable?: boolean
          is_heating_relevant?: boolean
          is_reserve_funded?: boolean
          is_system_account?: boolean | null
          is_wirtschaftsplan_relevant?: boolean
          reserve_role?: string | null
          settlement_35a_type?: string | null
          settlement_section?: string | null
          sort_order?: number | null
          umlagefaehig?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_knowledge_documents: {
        Row: {
          applies_to: string
          category: string
          char_count: number | null
          content: string
          created_at: string
          file_path: string | null
          id: string
          keywords: string[] | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          page_count: number | null
          title: string
          updated_at: string
        }
        Insert: {
          applies_to?: string
          category?: string
          char_count?: number | null
          content: string
          created_at?: string
          file_path?: string | null
          id?: string
          keywords?: string[] | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          page_count?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          applies_to?: string
          category?: string
          char_count?: number | null
          content?: string
          created_at?: string
          file_path?: string | null
          id?: string
          keywords?: string[] | null
          management_mode?: Database["public"]["Enums"]["management_mode"]
          page_count?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chatbot_messages: {
        Row: {
          building_id: string | null
          content: string
          created_at: string
          id: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          metadata: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          building_id?: string | null
          content: string
          created_at?: string
          id?: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          metadata?: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          building_id?: string | null
          content?: string
          created_at?: string
          id?: string
          management_mode?: Database["public"]["Enums"]["management_mode"]
          metadata?: Json | null
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chatbot_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_sessions: {
        Row: {
          building_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          building_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          management_mode?: Database["public"]["Enums"]["management_mode"]
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chatbot_settings: {
        Row: {
          id: string
          knowledge_base: string | null
          knowledge_items: Json | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          max_tokens: number | null
          model: string | null
          openai_api_key: string | null
          system_prompt: string | null
          temperature: number | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          knowledge_base?: string | null
          knowledge_items?: Json | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          max_tokens?: number | null
          model?: string | null
          openai_api_key?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          knowledge_base?: string | null
          knowledge_items?: Json | null
          management_mode?: Database["public"]["Enums"]["management_mode"]
          max_tokens?: number | null
          model?: string | null
          openai_api_key?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      comm_campaigns: {
        Row: {
          attachment_paths: string[]
          body_format: string
          body_html_override: string | null
          building_id: string
          combined_pdf_path: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          docx_path_override: string | null
          email_account_id: string | null
          error_message: string | null
          failed_count: number
          free_vars: Json
          id: string
          name: string
          recipient_count: number
          recipient_filter: Json
          result_pdf_path: string | null
          result_zip_path: string | null
          scheduled_at: string | null
          sent_count: number
          status: string
          subject_override: string | null
          template_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          attachment_paths?: string[]
          body_format?: string
          body_html_override?: string | null
          building_id: string
          combined_pdf_path?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          docx_path_override?: string | null
          email_account_id?: string | null
          error_message?: string | null
          failed_count?: number
          free_vars?: Json
          id?: string
          name: string
          recipient_count?: number
          recipient_filter?: Json
          result_pdf_path?: string | null
          result_zip_path?: string | null
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          subject_override?: string | null
          template_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          attachment_paths?: string[]
          body_format?: string
          body_html_override?: string | null
          building_id?: string
          combined_pdf_path?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          docx_path_override?: string | null
          email_account_id?: string | null
          error_message?: string | null
          failed_count?: number
          free_vars?: Json
          id?: string
          name?: string
          recipient_count?: number
          recipient_filter?: Json
          result_pdf_path?: string | null
          result_zip_path?: string | null
          scheduled_at?: string | null
          sent_count?: number
          status?: string
          subject_override?: string | null
          template_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_campaigns_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "comm_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_recipient_overrides: {
        Row: {
          body_html: string | null
          campaign_id: string
          contact_id: string
          created_at: string
          id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          campaign_id: string
          contact_id: string
          created_at?: string
          id?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          campaign_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_recipient_overrides_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "comm_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_recipients: {
        Row: {
          building_id: string | null
          campaign_id: string
          contact_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          error: string | null
          generated_file_path: string | null
          id: string
          person_id: string | null
          resolved_vars: Json
          sent_at: string | null
          status: string
        }
        Insert: {
          building_id?: string | null
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          error?: string | null
          generated_file_path?: string | null
          id?: string
          person_id?: string | null
          resolved_vars?: Json
          sent_at?: string | null
          status?: string
        }
        Update: {
          building_id?: string | null
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          error?: string | null
          generated_file_path?: string | null
          id?: string
          person_id?: string | null
          resolved_vars?: Json
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_recipients_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "comm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comm_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_templates: {
        Row: {
          body_format: string
          body_html: string | null
          building_id: string | null
          created_at: string
          created_by: string
          description: string | null
          docx_path: string | null
          id: string
          is_global: boolean
          name: string
          subject: string | null
          template_kind: string
          type: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body_format?: string
          body_html?: string | null
          building_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          docx_path?: string | null
          id?: string
          is_global?: boolean
          name: string
          subject?: string | null
          template_kind?: string
          type: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_format?: string
          body_html?: string | null
          building_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          docx_path?: string | null
          id?: string
          is_global?: boolean
          name?: string
          subject?: string | null
          template_kind?: string
          type?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "comm_templates_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_bank_accounts: {
        Row: {
          account_holder: string | null
          bank_name: string | null
          bic: string | null
          contact_id: string
          created_at: string
          iban: string | null
          id: string
          is_default: boolean | null
          person_id: string | null
          sepa_mandate_date: string | null
          sepa_mandate_ref: string | null
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          bank_name?: string | null
          bic?: string | null
          contact_id: string
          created_at?: string
          iban?: string | null
          id?: string
          is_default?: boolean | null
          person_id?: string | null
          sepa_mandate_date?: string | null
          sepa_mandate_ref?: string | null
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          bank_name?: string | null
          bic?: string | null
          contact_id?: string
          created_at?: string
          iban?: string | null
          id?: string
          is_default?: boolean | null
          person_id?: string | null
          sepa_mandate_date?: string | null
          sepa_mandate_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_bank_accounts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_bank_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "contact_persons"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_building_assignments: {
        Row: {
          address_as_separate_letter: boolean
          address_city_override: string | null
          address_street_override: string | null
          address_zip_override: string | null
          area_sqm_override: number | null
          bank_account_id: string | null
          billing_mode: Database["public"]["Enums"]["billing_mode"]
          building_id: string
          company_name_override: string | null
          contact_id: string
          created_at: string
          emails_override: Json | null
          emergency_note: string | null
          emergency_sort_order: number | null
          expectations_override: string | null
          first_name_override: string | null
          floor_location: string | null
          iban_holder_override: string | null
          iban_override: string | null
          id: string
          is_active: boolean | null
          is_cash_auditor: boolean
          is_emergency_contact: boolean
          last_name_override: string | null
          notes: string | null
          parent_assignment_id: string | null
          phones_override: Json | null
          primary_contact_other: Json | null
          primary_contact_self: boolean | null
          role_in_building:
            | Database["public"]["Enums"]["contact_building_role"]
            | null
          salutation_override: string | null
          service_category: string | null
          unit_kind: Database["public"]["Enums"]["unit_kind"]
          unit_number: string | null
          updated_at: string
          usage_since: string | null
          usage_type: Database["public"]["Enums"]["contact_usage_type"] | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          address_as_separate_letter?: boolean
          address_city_override?: string | null
          address_street_override?: string | null
          address_zip_override?: string | null
          area_sqm_override?: number | null
          bank_account_id?: string | null
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
          building_id: string
          company_name_override?: string | null
          contact_id: string
          created_at?: string
          emails_override?: Json | null
          emergency_note?: string | null
          emergency_sort_order?: number | null
          expectations_override?: string | null
          first_name_override?: string | null
          floor_location?: string | null
          iban_holder_override?: string | null
          iban_override?: string | null
          id?: string
          is_active?: boolean | null
          is_cash_auditor?: boolean
          is_emergency_contact?: boolean
          last_name_override?: string | null
          notes?: string | null
          parent_assignment_id?: string | null
          phones_override?: Json | null
          primary_contact_other?: Json | null
          primary_contact_self?: boolean | null
          role_in_building?:
            | Database["public"]["Enums"]["contact_building_role"]
            | null
          salutation_override?: string | null
          service_category?: string | null
          unit_kind?: Database["public"]["Enums"]["unit_kind"]
          unit_number?: string | null
          updated_at?: string
          usage_since?: string | null
          usage_type?: Database["public"]["Enums"]["contact_usage_type"] | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          address_as_separate_letter?: boolean
          address_city_override?: string | null
          address_street_override?: string | null
          address_zip_override?: string | null
          area_sqm_override?: number | null
          bank_account_id?: string | null
          billing_mode?: Database["public"]["Enums"]["billing_mode"]
          building_id?: string
          company_name_override?: string | null
          contact_id?: string
          created_at?: string
          emails_override?: Json | null
          emergency_note?: string | null
          emergency_sort_order?: number | null
          expectations_override?: string | null
          first_name_override?: string | null
          floor_location?: string | null
          iban_holder_override?: string | null
          iban_override?: string | null
          id?: string
          is_active?: boolean | null
          is_cash_auditor?: boolean
          is_emergency_contact?: boolean
          last_name_override?: string | null
          notes?: string | null
          parent_assignment_id?: string | null
          phones_override?: Json | null
          primary_contact_other?: Json | null
          primary_contact_self?: boolean | null
          role_in_building?:
            | Database["public"]["Enums"]["contact_building_role"]
            | null
          salutation_override?: string | null
          service_category?: string | null
          unit_kind?: Database["public"]["Enums"]["unit_kind"]
          unit_number?: string | null
          updated_at?: string
          usage_since?: string | null
          usage_type?: Database["public"]["Enums"]["contact_usage_type"] | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_building_assignments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "contact_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_building_assignments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_building_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_building_assignments_parent_assignment_id_fkey"
            columns: ["parent_assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_building_costs: {
        Row: {
          amount: number
          assignment_id: string
          cost_type: string
          created_at: string
          id: string
          interval: Database["public"]["Enums"]["cost_interval"] | null
          reserve_share_monthly: number
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          amount?: number
          assignment_id: string
          cost_type: string
          created_at?: string
          id?: string
          interval?: Database["public"]["Enums"]["cost_interval"] | null
          reserve_share_monthly?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          amount?: number
          assignment_id?: string
          cost_type?: string
          created_at?: string
          id?: string
          interval?: Database["public"]["Enums"]["cost_interval"] | null
          reserve_share_monthly?: number
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_building_costs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_building_shares: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          share_type: string
          share_value: number
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          share_type: string
          share_value?: number
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          share_type?: string
          share_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_building_shares_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_change_notifications: {
        Row: {
          acknowledge_note: string | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          bank_account_id: string | null
          building_id: string | null
          change_type: string
          contact_id: string
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          status: string
        }
        Insert: {
          acknowledge_note?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          bank_account_id?: string | null
          building_id?: string | null
          change_type?: string
          contact_id: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          status?: string
        }
        Update: {
          acknowledge_note?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          bank_account_id?: string | null
          building_id?: string | null
          change_type?: string
          contact_id?: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_change_notifications_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_change_notifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_emails: {
        Row: {
          contact_id: string
          created_at: string
          email: string
          id: string
          is_primary: boolean | null
          label: string | null
          note: string | null
          person_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean | null
          label?: string | null
          note?: string | null
          person_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean | null
          label?: string | null
          note?: string | null
          person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_emails_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "contact_persons"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_persons: {
        Row: {
          contact_id: string
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string
          is_primary: boolean | null
          last_name: string | null
          notes: string | null
          onboarding_expectations: string | null
          phone: string | null
          position: string | null
          salutation: string | null
          sort_order: number | null
          updated_at: string | null
          willing_cash_audit: boolean | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          notes?: string | null
          onboarding_expectations?: string | null
          phone?: string | null
          position?: string | null
          salutation?: string | null
          sort_order?: number | null
          updated_at?: string | null
          willing_cash_audit?: boolean | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_primary?: boolean | null
          last_name?: string | null
          notes?: string | null
          onboarding_expectations?: string | null
          phone?: string | null
          position?: string | null
          salutation?: string | null
          sort_order?: number | null
          updated_at?: string | null
          willing_cash_audit?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_persons_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_phones: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          label: string | null
          note: string | null
          person_id: string | null
          phone_number: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          person_id?: string | null
          phone_number: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          label?: string | null
          note?: string | null
          person_id?: string | null
          phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_phones_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_phones_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "contact_persons"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address_city: string | null
          address_lat: number | null
          address_lon: number | null
          address_street: string | null
          address_zip: string | null
          company_name: string | null
          contact_type: Database["public"]["Enums"]["contact_type"] | null
          created_at: string
          first_name: string | null
          id: string
          is_emergency_service: boolean
          is_service_provider_pool: boolean
          last_hired_at: string | null
          last_name: string | null
          notes: string | null
          onboarding_category: string | null
          rating: number | null
          salutation: string | null
          service_provider_categories: string[]
          short_name: string | null
          suggest_in_onboarding: boolean | null
          trade_notes: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_city?: string | null
          address_lat?: number | null
          address_lon?: number | null
          address_street?: string | null
          address_zip?: string | null
          company_name?: string | null
          contact_type?: Database["public"]["Enums"]["contact_type"] | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_emergency_service?: boolean
          is_service_provider_pool?: boolean
          last_hired_at?: string | null
          last_name?: string | null
          notes?: string | null
          onboarding_category?: string | null
          rating?: number | null
          salutation?: string | null
          service_provider_categories?: string[]
          short_name?: string | null
          suggest_in_onboarding?: boolean | null
          trade_notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_city?: string | null
          address_lat?: number | null
          address_lon?: number | null
          address_street?: string | null
          address_zip?: string | null
          company_name?: string | null
          contact_type?: Database["public"]["Enums"]["contact_type"] | null
          created_at?: string
          first_name?: string | null
          id?: string
          is_emergency_service?: boolean
          is_service_provider_pool?: boolean
          last_hired_at?: string | null
          last_name?: string | null
          notes?: string | null
          onboarding_category?: string | null
          rating?: number | null
          salutation?: string | null
          service_provider_categories?: string[]
          short_name?: string | null
          suggest_in_onboarding?: boolean | null
          trade_notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      document_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          sources: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          sources?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "document_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chat_sessions: {
        Row: {
          building_id: string | null
          building_ids: string[] | null
          created_at: string
          id: string
          include_general: boolean
          search_scope: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          building_id?: string | null
          building_ids?: string[] | null
          created_at?: string
          id?: string
          include_general?: boolean
          search_scope?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          building_id?: string | null
          building_ids?: string[] | null
          created_at?: string
          id?: string
          include_general?: boolean
          search_scope?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chat_sessions_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chat_settings: {
        Row: {
          created_at: string
          id: string
          max_tokens: number | null
          model: string | null
          system_prompt: string | null
          temperature: number | null
          updated_at: string
          web_system_prompt: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          max_tokens?: number | null
          model?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
          web_system_prompt?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          max_tokens?: number | null
          model?: string | null
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
          web_system_prompt?: string | null
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          building_id: string | null
          category: string
          category_id: string | null
          category_path: string[] | null
          category_slug: string | null
          chunk_index: number
          content: string
          created_at: string
          document_id: string | null
          embedding: string | null
          file_id: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          building_id?: string | null
          category: string
          category_id?: string | null
          category_path?: string[] | null
          category_slug?: string | null
          chunk_index: number
          content: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          file_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          building_id?: string | null
          category?: string
          category_id?: string | null
          category_path?: string[] | null
          category_slug?: string | null
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string | null
          embedding?: string | null
          file_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "building_file_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "building_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "building_files"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_plan_items: {
        Row: {
          account_id: string | null
          adjustment_reason: string | null
          created_at: string | null
          distribution_key: string | null
          id: string
          manually_overridden: boolean
          plan_id: string
          planned_amount: number | null
          previous_amount: number | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          adjustment_reason?: string | null
          created_at?: string | null
          distribution_key?: string | null
          id?: string
          manually_overridden?: boolean
          plan_id: string
          planned_amount?: number | null
          previous_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          adjustment_reason?: string | null
          created_at?: string | null
          distribution_key?: string | null
          id?: string
          manually_overridden?: boolean
          plan_id?: string
          planned_amount?: number | null
          previous_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "economic_plan_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "economic_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "economic_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_plan_unit_items: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          created_by: string | null
          id: string
          manually_overridden: boolean
          override_reason: string | null
          plan_id: string
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          manually_overridden?: boolean
          override_reason?: string | null
          plan_id: string
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          manually_overridden?: boolean
          override_reason?: string | null
          plan_id?: string
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "economic_plan_unit_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "economic_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_plans: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          adjustments: Json | null
          approved_at: string | null
          approved_by: string | null
          based_on_period_id: string | null
          building_id: string
          created_at: string | null
          fiscal_year: number
          id: string
          notes: string | null
          source: string
          status: string
          total_costs: number | null
          total_reserve: number | null
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          adjustments?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          based_on_period_id?: string | null
          building_id: string
          created_at?: string | null
          fiscal_year: number
          id?: string
          notes?: string | null
          source?: string
          status?: string
          total_costs?: number | null
          total_reserve?: number | null
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          adjustments?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          based_on_period_id?: string | null
          building_id?: string
          created_at?: string | null
          fiscal_year?: number
          id?: string
          notes?: string | null
          source?: string
          status?: string
          total_costs?: number | null
          total_reserve?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "economic_plans_based_on_period_id_fkey"
            columns: ["based_on_period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "economic_plans_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      email_account_subscriptions: {
        Row: {
          account_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_account_subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_account_users: {
        Row: {
          account_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_account_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_account_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          created_at: string
          delete_after_import: boolean
          display_name: string
          email_address: string
          id: string
          imap_host: string
          imap_password: string
          imap_port: number
          imap_user: string
          import_since: string | null
          is_active: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_uid: string | null
          short_code: string | null
          signature_html: string | null
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_user: string
          sync_interval_minutes: number
          uid_validity: string | null
          updated_at: string
          use_ssl: boolean
        }
        Insert: {
          created_at?: string
          delete_after_import?: boolean
          display_name: string
          email_address: string
          id?: string
          imap_host: string
          imap_password: string
          imap_port?: number
          imap_user: string
          import_since?: string | null
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_uid?: string | null
          short_code?: string | null
          signature_html?: string | null
          smtp_host: string
          smtp_password: string
          smtp_port?: number
          smtp_user: string
          sync_interval_minutes?: number
          uid_validity?: string | null
          updated_at?: string
          use_ssl?: boolean
        }
        Update: {
          created_at?: string
          delete_after_import?: boolean
          display_name?: string
          email_address?: string
          id?: string
          imap_host?: string
          imap_password?: string
          imap_port?: number
          imap_user?: string
          import_since?: string | null
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_uid?: string | null
          short_code?: string | null
          signature_html?: string | null
          smtp_host?: string
          smtp_password?: string
          smtp_port?: number
          smtp_user?: string
          sync_interval_minutes?: number
          uid_validity?: string | null
          updated_at?: string
          use_ssl?: boolean
        }
        Relationships: []
      }
      email_attachments: {
        Row: {
          content_id: string | null
          created_at: string
          email_id: string
          file_name: string
          file_path: string | null
          file_size: number | null
          id: string
          is_inline: boolean
          mime_type: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string
          email_id: string
          file_name: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_inline?: boolean
          mime_type?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string
          email_id?: string
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_inline?: boolean
          mime_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_change_requests: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          new_email: string
          old_email: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          new_email: string
          old_email: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          new_email?: string
          old_email?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          account_id: string | null
          attachments: Json
          bcc_addresses: string[] | null
          body_html: string | null
          body_text: string
          cc_addresses: string[] | null
          created_at: string
          forward_email_id: string | null
          id: string
          reply_to_email_id: string | null
          subject: string
          to_addresses: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          attachments?: Json
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_text?: string
          cc_addresses?: string[] | null
          created_at?: string
          forward_email_id?: string | null
          id?: string
          reply_to_email_id?: string | null
          subject?: string
          to_addresses?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          attachments?: Json
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_text?: string
          cc_addresses?: string[] | null
          created_at?: string
          forward_email_id?: string | null
          id?: string
          reply_to_email_id?: string | null
          subject?: string
          to_addresses?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_folders: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_system: boolean
          name: string
          sort_order: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name: string
          sort_order?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      email_rules: {
        Row: {
          action_type: string
          action_value: string | null
          building_id: string | null
          condition_field: string
          condition_operator: string
          condition_value: string
          contact_id: string | null
          created_at: string
          folder_id: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          action_type?: string
          action_value?: string | null
          building_id?: string | null
          condition_field: string
          condition_operator?: string
          condition_value: string
          contact_id?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          action_value?: string | null
          building_id?: string | null
          condition_field?: string
          condition_operator?: string
          condition_value?: string
          contact_id?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_rules_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_rules_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_rules_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "email_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string
          id: string
          is_shared: boolean
          last_used_at: string | null
          name: string
          sort_order: number
          subject: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_shared?: boolean
          last_used_at?: string | null
          name: string
          sort_order?: number
          subject?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_shared?: boolean
          last_used_at?: string | null
          name?: string
          sort_order?: number
          subject?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      emails: {
        Row: {
          account_id: string
          ai_case_confidence: number | null
          ai_case_suggestion_id: string | null
          ai_category: string | null
          ai_classified_at: string | null
          ai_priority: string | null
          ai_summary: string | null
          assigned_to: string | null
          attachments_incomplete: boolean
          bcc_addresses: Json | null
          body_html: string | null
          body_text: string | null
          broker_lead_id: string | null
          broker_property_id: string | null
          building_id: string | null
          case_id: string | null
          cc_addresses: Json | null
          contact_id: string | null
          contact_person_id: string | null
          created_at: string
          date: string | null
          deleted_at: string | null
          etv_agenda_item_id: string | null
          etv_meeting_id: string | null
          folder_id: string | null
          from_address: string | null
          from_name: string | null
          has_attachments: boolean
          id: string
          imap_uid: string | null
          in_reply_to: string | null
          is_archived: boolean
          is_draft: boolean
          is_etv_relevant: boolean
          is_pinned: boolean
          is_read: boolean
          is_starred: boolean
          message_id: string | null
          message_id_header: string | null
          pinned_at: string | null
          process_id: string | null
          subject: string | null
          thread_id: string | null
          to_addresses: Json | null
          to_names: string[] | null
          updated_at: string
        }
        Insert: {
          account_id: string
          ai_case_confidence?: number | null
          ai_case_suggestion_id?: string | null
          ai_category?: string | null
          ai_classified_at?: string | null
          ai_priority?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          attachments_incomplete?: boolean
          bcc_addresses?: Json | null
          body_html?: string | null
          body_text?: string | null
          broker_lead_id?: string | null
          broker_property_id?: string | null
          building_id?: string | null
          case_id?: string | null
          cc_addresses?: Json | null
          contact_id?: string | null
          contact_person_id?: string | null
          created_at?: string
          date?: string | null
          deleted_at?: string | null
          etv_agenda_item_id?: string | null
          etv_meeting_id?: string | null
          folder_id?: string | null
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          imap_uid?: string | null
          in_reply_to?: string | null
          is_archived?: boolean
          is_draft?: boolean
          is_etv_relevant?: boolean
          is_pinned?: boolean
          is_read?: boolean
          is_starred?: boolean
          message_id?: string | null
          message_id_header?: string | null
          pinned_at?: string | null
          process_id?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: Json | null
          to_names?: string[] | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          ai_case_confidence?: number | null
          ai_case_suggestion_id?: string | null
          ai_category?: string | null
          ai_classified_at?: string | null
          ai_priority?: string | null
          ai_summary?: string | null
          assigned_to?: string | null
          attachments_incomplete?: boolean
          bcc_addresses?: Json | null
          body_html?: string | null
          body_text?: string | null
          broker_lead_id?: string | null
          broker_property_id?: string | null
          building_id?: string | null
          case_id?: string | null
          cc_addresses?: Json | null
          contact_id?: string | null
          contact_person_id?: string | null
          created_at?: string
          date?: string | null
          deleted_at?: string | null
          etv_agenda_item_id?: string | null
          etv_meeting_id?: string | null
          folder_id?: string | null
          from_address?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          imap_uid?: string | null
          in_reply_to?: string | null
          is_archived?: boolean
          is_draft?: boolean
          is_etv_relevant?: boolean
          is_pinned?: boolean
          is_read?: boolean
          is_starred?: boolean
          message_id?: string | null
          message_id_header?: string | null
          pinned_at?: string | null
          process_id?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: Json | null
          to_names?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_ai_case_suggestion_id_fkey"
            columns: ["ai_case_suggestion_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "emails_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_contact_person_id_fkey"
            columns: ["contact_person_id"]
            isOneToOne: false
            referencedRelation: "contact_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_etv_agenda_item_id_fkey"
            columns: ["etv_agenda_item_id"]
            isOneToOne: false
            referencedRelation: "etv_agenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_etv_meeting_id_fkey"
            columns: ["etv_meeting_id"]
            isOneToOne: false
            referencedRelation: "etv_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "email_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      etv_agenda_items: {
        Row: {
          abstain_count: number | null
          admin_notes: string | null
          attachment_paths: string[] | null
          category: string | null
          created_at: string | null
          description: string | null
          double_qualified_relevant: boolean
          id: string
          is_actionable: boolean
          meeting_id: string
          no_count: number | null
          requires_double_qualified: boolean
          requires_resolution: boolean
          resolution_text: string | null
          result: string | null
          sort_order: number
          status: string | null
          submitted_by_contact_id: string | null
          submitted_by_user_id: string | null
          title: string
          total_mea_abstain: number
          total_mea_no: number
          total_mea_voted: number | null
          total_mea_yes: number
          voting_principle: string
          yes_count: number | null
        }
        Insert: {
          abstain_count?: number | null
          admin_notes?: string | null
          attachment_paths?: string[] | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          double_qualified_relevant?: boolean
          id?: string
          is_actionable?: boolean
          meeting_id: string
          no_count?: number | null
          requires_double_qualified?: boolean
          requires_resolution?: boolean
          resolution_text?: string | null
          result?: string | null
          sort_order?: number
          status?: string | null
          submitted_by_contact_id?: string | null
          submitted_by_user_id?: string | null
          title: string
          total_mea_abstain?: number
          total_mea_no?: number
          total_mea_voted?: number | null
          total_mea_yes?: number
          voting_principle?: string
          yes_count?: number | null
        }
        Update: {
          abstain_count?: number | null
          admin_notes?: string | null
          attachment_paths?: string[] | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          double_qualified_relevant?: boolean
          id?: string
          is_actionable?: boolean
          meeting_id?: string
          no_count?: number | null
          requires_double_qualified?: boolean
          requires_resolution?: boolean
          resolution_text?: string | null
          result?: string | null
          sort_order?: number
          status?: string | null
          submitted_by_contact_id?: string | null
          submitted_by_user_id?: string | null
          title?: string
          total_mea_abstain?: number
          total_mea_no?: number
          total_mea_voted?: number | null
          total_mea_yes?: number
          voting_principle?: string
          yes_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "etv_agenda_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "etv_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_agenda_items_submitted_by_contact_id_fkey"
            columns: ["submitted_by_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_agenda_items_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      etv_attendees: {
        Row: {
          assignment_id: string
          attendance_type: string
          checked_in_at: string | null
          created_at: string | null
          id: string
          meeting_id: string
          pre_vote_instructions: Json | null
          proxy_contact_id: string | null
          proxy_document_file_id: string | null
          proxy_external_name: string | null
          proxy_granted_via: string | null
          proxy_recorded_at: string | null
          proxy_recorded_by: string | null
          proxy_source: string | null
          proxy_token: string | null
          proxy_token_used: boolean | null
          proxy_type: string | null
          self_registered_at: string | null
          self_reported_type: string | null
          voting_banned_items: string[] | null
        }
        Insert: {
          assignment_id: string
          attendance_type?: string
          checked_in_at?: string | null
          created_at?: string | null
          id?: string
          meeting_id: string
          pre_vote_instructions?: Json | null
          proxy_contact_id?: string | null
          proxy_document_file_id?: string | null
          proxy_external_name?: string | null
          proxy_granted_via?: string | null
          proxy_recorded_at?: string | null
          proxy_recorded_by?: string | null
          proxy_source?: string | null
          proxy_token?: string | null
          proxy_token_used?: boolean | null
          proxy_type?: string | null
          self_registered_at?: string | null
          self_reported_type?: string | null
          voting_banned_items?: string[] | null
        }
        Update: {
          assignment_id?: string
          attendance_type?: string
          checked_in_at?: string | null
          created_at?: string | null
          id?: string
          meeting_id?: string
          pre_vote_instructions?: Json | null
          proxy_contact_id?: string | null
          proxy_document_file_id?: string | null
          proxy_external_name?: string | null
          proxy_granted_via?: string | null
          proxy_recorded_at?: string | null
          proxy_recorded_by?: string | null
          proxy_source?: string | null
          proxy_token?: string | null
          proxy_token_used?: boolean | null
          proxy_type?: string | null
          self_registered_at?: string | null
          self_reported_type?: string | null
          voting_banned_items?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "etv_attendees_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "etv_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_attendees_proxy_contact_id_fkey"
            columns: ["proxy_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_attendees_proxy_document_file_id_fkey"
            columns: ["proxy_document_file_id"]
            isOneToOne: false
            referencedRelation: "building_files"
            referencedColumns: ["id"]
          },
        ]
      }
      etv_manual_notes: {
        Row: {
          building_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "etv_manual_notes_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      etv_meetings: {
        Row: {
          building_id: string
          created_at: string | null
          created_by: string | null
          ended_at: string | null
          id: string
          is_secret_ballot: boolean
          location: string | null
          lock_time: string | null
          meeting_chair: string | null
          meeting_date: string | null
          minutes_taker: string | null
          notes: string | null
          protocol_generated_at: string | null
          protocol_published: boolean | null
          protocol_text: string | null
          quorum_reached: boolean | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          building_id: string
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          is_secret_ballot?: boolean
          location?: string | null
          lock_time?: string | null
          meeting_chair?: string | null
          meeting_date?: string | null
          minutes_taker?: string | null
          notes?: string | null
          protocol_generated_at?: string | null
          protocol_published?: boolean | null
          protocol_text?: string | null
          quorum_reached?: boolean | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          building_id?: string
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          is_secret_ballot?: boolean
          location?: string | null
          lock_time?: string | null
          meeting_chair?: string | null
          meeting_date?: string | null
          minutes_taker?: string | null
          notes?: string | null
          protocol_generated_at?: string | null
          protocol_published?: boolean | null
          protocol_text?: string | null
          quorum_reached?: boolean | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "etv_meetings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      etv_protocol_renders: {
        Row: {
          created_at: string
          created_by: string | null
          dms_file_id: string | null
          format: string
          id: string
          is_signed: boolean
          meeting_id: string
          storage_path: string
          template_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dms_file_id?: string | null
          format: string
          id?: string
          is_signed?: boolean
          meeting_id: string
          storage_path: string
          template_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dms_file_id?: string | null
          format?: string
          id?: string
          is_signed?: boolean
          meeting_id?: string
          storage_path?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "etv_protocol_renders_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "etv_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_protocol_renders_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "etv_protocol_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      etv_protocol_signatures: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          role: string
          signature_png: string
          signed_at: string
          signed_by: string | null
          signer_contact_id: string | null
          signer_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          role: string
          signature_png: string
          signed_at?: string
          signed_by?: string | null
          signer_contact_id?: string | null
          signer_name: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          role?: string
          signature_png?: string
          signed_at?: string
          signed_by?: string | null
          signer_contact_id?: string | null
          signer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "etv_protocol_signatures_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "etv_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_protocol_signatures_signer_contact_id_fkey"
            columns: ["signer_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      etv_protocol_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          placeholder_schema: Json | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          placeholder_schema?: Json | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          placeholder_schema?: Json | null
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      etv_resolution_templates: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          double_qualified_relevant: boolean
          id: string
          is_actionable: boolean
          requires_double_qualified: boolean
          requires_resolution: boolean
          resolution_text: string | null
          sort_order: number | null
          title: string
          updated_at: string
          voting_principle: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          double_qualified_relevant?: boolean
          id?: string
          is_actionable?: boolean
          requires_double_qualified?: boolean
          requires_resolution?: boolean
          resolution_text?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
          voting_principle?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          double_qualified_relevant?: boolean
          id?: string
          is_actionable?: boolean
          requires_double_qualified?: boolean
          requires_resolution?: boolean
          resolution_text?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
          voting_principle?: string | null
        }
        Relationships: []
      }
      etv_resolutions: {
        Row: {
          abstain_count: number | null
          actionable_status: string
          agenda_item_id: string | null
          building_id: string
          case_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_actionable: boolean
          meeting_id: string | null
          no_count: number | null
          notes: string | null
          published: boolean | null
          resolution_number: string | null
          resolution_text: string
          resolved_at: string | null
          result: string
          source: string
          voting_principle: string | null
          yes_count: number | null
        }
        Insert: {
          abstain_count?: number | null
          actionable_status?: string
          agenda_item_id?: string | null
          building_id: string
          case_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_actionable?: boolean
          meeting_id?: string | null
          no_count?: number | null
          notes?: string | null
          published?: boolean | null
          resolution_number?: string | null
          resolution_text: string
          resolved_at?: string | null
          result: string
          source?: string
          voting_principle?: string | null
          yes_count?: number | null
        }
        Update: {
          abstain_count?: number | null
          actionable_status?: string
          agenda_item_id?: string | null
          building_id?: string
          case_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_actionable?: boolean
          meeting_id?: string | null
          no_count?: number | null
          notes?: string | null
          published?: boolean | null
          resolution_number?: string | null
          resolution_text?: string
          resolved_at?: string | null
          result?: string
          source?: string
          voting_principle?: string | null
          yes_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "etv_resolutions_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "etv_agenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_resolutions_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_resolutions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_resolutions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "etv_resolutions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "etv_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      etv_submitted_tops: {
        Row: {
          accepted_into_meeting_id: string | null
          admin_notes: string | null
          attachment_paths: string[] | null
          building_id: string
          created_at: string
          description: string | null
          id: string
          status: string
          submitted_by_user_id: string
          title: string
          updated_at: string
        }
        Insert: {
          accepted_into_meeting_id?: string | null
          admin_notes?: string | null
          attachment_paths?: string[] | null
          building_id: string
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          submitted_by_user_id: string
          title: string
          updated_at?: string
        }
        Update: {
          accepted_into_meeting_id?: string | null
          admin_notes?: string | null
          attachment_paths?: string[] | null
          building_id?: string
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          submitted_by_user_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "etv_submitted_tops_accepted_into_meeting_id_fkey"
            columns: ["accepted_into_meeting_id"]
            isOneToOne: false
            referencedRelation: "etv_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_submitted_tops_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_submitted_tops_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      etv_votes: {
        Row: {
          agenda_item_id: string
          assignment_id: string
          id: string
          ip_address: string | null
          is_manual_override: boolean | null
          is_proxy_vote: boolean | null
          mea_weight: number | null
          sqm_weight: number | null
          vote: string
          voted_at: string | null
          voted_by_user_id: string | null
        }
        Insert: {
          agenda_item_id: string
          assignment_id: string
          id?: string
          ip_address?: string | null
          is_manual_override?: boolean | null
          is_proxy_vote?: boolean | null
          mea_weight?: number | null
          sqm_weight?: number | null
          vote: string
          voted_at?: string | null
          voted_by_user_id?: string | null
        }
        Update: {
          agenda_item_id?: string
          assignment_id?: string
          id?: string
          ip_address?: string | null
          is_manual_override?: boolean | null
          is_proxy_vote?: boolean | null
          mea_weight?: number | null
          sqm_weight?: number | null
          vote?: string
          voted_at?: string | null
          voted_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "etv_votes_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "etv_agenda_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etv_votes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_post_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          management_mode?: Database["public"]["Enums"]["management_mode"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      forum_posts: {
        Row: {
          attachments: Json | null
          author_id: string | null
          building_id: string | null
          content: string
          created_at: string | null
          id: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          title: string
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          building_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          title: string
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          building_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          management_mode?: Database["public"]["Enums"]["management_mode"]
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_inventory: {
        Row: {
          billing_period_id: string | null
          building_id: string
          co2_emissions_kg: number | null
          co2_tax_amount: number | null
          consumption_period_from: string | null
          consumption_period_to: string | null
          consumption_year: number | null
          created_at: string
          energy_content_kwh: number | null
          entry_date: string
          entry_type: string
          fuel_type: string
          heating_unit_id: string | null
          id: string
          invoice_id: string | null
          net_amount: number | null
          notes: string | null
          quantity: number
          total_price: number
          unit: string
          unit_price: number | null
          vat_amount: number | null
        }
        Insert: {
          billing_period_id?: string | null
          building_id: string
          co2_emissions_kg?: number | null
          co2_tax_amount?: number | null
          consumption_period_from?: string | null
          consumption_period_to?: string | null
          consumption_year?: number | null
          created_at?: string
          energy_content_kwh?: number | null
          entry_date?: string
          entry_type?: string
          fuel_type?: string
          heating_unit_id?: string | null
          id?: string
          invoice_id?: string | null
          net_amount?: number | null
          notes?: string | null
          quantity?: number
          total_price?: number
          unit?: string
          unit_price?: number | null
          vat_amount?: number | null
        }
        Update: {
          billing_period_id?: string | null
          building_id?: string
          co2_emissions_kg?: number | null
          co2_tax_amount?: number | null
          consumption_period_from?: string | null
          consumption_period_to?: string | null
          consumption_year?: number | null
          created_at?: string
          energy_content_kwh?: number | null
          entry_date?: string
          entry_type?: string
          fuel_type?: string
          heating_unit_id?: string | null
          id?: string
          invoice_id?: string | null
          net_amount?: number | null
          notes?: string | null
          quantity?: number
          total_price?: number
          unit?: string
          unit_price?: number | null
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_inventory_billing_period_id_fkey"
            columns: ["billing_period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_inventory_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_inventory_heating_unit_id_fkey"
            columns: ["heating_unit_id"]
            isOneToOne: false
            referencedRelation: "heating_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_inventory_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      heating_distribution_values: {
        Row: {
          amount: number
          assignment_id: string
          billing_period_id: string
          building_id: string
          created_at: string | null
          id: string
          note: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          assignment_id: string
          billing_period_id: string
          building_id: string
          created_at?: string | null
          id?: string
          note?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          assignment_id?: string
          billing_period_id?: string
          building_id?: string
          created_at?: string | null
          id?: string
          note?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heating_distribution_values_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heating_distribution_values_billing_period_id_fkey"
            columns: ["billing_period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heating_distribution_values_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      heating_units: {
        Row: {
          building_id: string
          created_at: string
          fuel_type: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          tank_capacity: number | null
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          fuel_type?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          tank_capacity?: number | null
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          fuel_type?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          tank_capacity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "heating_units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      in_app_email_subscriptions: {
        Row: {
          account_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          billing_period_from: string | null
          billing_period_to: string | null
          building_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          duplicate_of: string | null
          einvoice_format: string | null
          einvoice_xml_path: string | null
          file_name: string | null
          file_path: string | null
          gross_amount: number | null
          id: string
          installment_period: string | null
          invoice_date: string | null
          invoice_number: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type"] | null
          is_company_invoice: boolean
          leitweg_id: string | null
          line_items: Json | null
          meter_number: string | null
          net_amount: number | null
          ocr_error: string | null
          ocr_extracted_data: Json | null
          ocr_raw_data: Json | null
          ocr_status: string
          paid_at: string | null
          paid_installments_total: number | null
          payment_notes: string | null
          payment_purpose: string | null
          review_status: string
          settlement_difference: number | null
          status: string
          suggested_account_id: string | null
          total_consumption: number | null
          updated_at: string
          utility_contract_id: string | null
          vat_amount: number | null
          vendor_display_name: string | null
          vendor_iban: string | null
          vendor_name: string | null
        }
        Insert: {
          billing_period_from?: string | null
          billing_period_to?: string | null
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          duplicate_of?: string | null
          einvoice_format?: string | null
          einvoice_xml_path?: string | null
          file_name?: string | null
          file_path?: string | null
          gross_amount?: number | null
          id?: string
          installment_period?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"] | null
          is_company_invoice?: boolean
          leitweg_id?: string | null
          line_items?: Json | null
          meter_number?: string | null
          net_amount?: number | null
          ocr_error?: string | null
          ocr_extracted_data?: Json | null
          ocr_raw_data?: Json | null
          ocr_status?: string
          paid_at?: string | null
          paid_installments_total?: number | null
          payment_notes?: string | null
          payment_purpose?: string | null
          review_status?: string
          settlement_difference?: number | null
          status?: string
          suggested_account_id?: string | null
          total_consumption?: number | null
          updated_at?: string
          utility_contract_id?: string | null
          vat_amount?: number | null
          vendor_display_name?: string | null
          vendor_iban?: string | null
          vendor_name?: string | null
        }
        Update: {
          billing_period_from?: string | null
          billing_period_to?: string | null
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          duplicate_of?: string | null
          einvoice_format?: string | null
          einvoice_xml_path?: string | null
          file_name?: string | null
          file_path?: string | null
          gross_amount?: number | null
          id?: string
          installment_period?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"] | null
          is_company_invoice?: boolean
          leitweg_id?: string | null
          line_items?: Json | null
          meter_number?: string | null
          net_amount?: number | null
          ocr_error?: string | null
          ocr_extracted_data?: Json | null
          ocr_raw_data?: Json | null
          ocr_status?: string
          paid_at?: string | null
          paid_installments_total?: number | null
          payment_notes?: string | null
          payment_purpose?: string | null
          review_status?: string
          settlement_difference?: number | null
          status?: string
          suggested_account_id?: string | null
          total_consumption?: number | null
          updated_at?: string
          utility_contract_id?: string | null
          vat_amount?: number | null
          vendor_display_name?: string | null
          vendor_iban?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_suggested_account_id_fkey"
            columns: ["suggested_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_utility_contract_id_fkey"
            columns: ["utility_contract_id"]
            isOneToOne: false
            referencedRelation: "utility_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      key_events: {
        Row: {
          actor_label: string | null
          actor_user_id: string | null
          building_id: string
          created_at: string
          event_type: string
          id: string
          key_id: string | null
          loan_id: string | null
          payload: Json
          tag_id: string | null
        }
        Insert: {
          actor_label?: string | null
          actor_user_id?: string | null
          building_id: string
          created_at?: string
          event_type: string
          id?: string
          key_id?: string | null
          loan_id?: string | null
          payload?: Json
          tag_id?: string | null
        }
        Update: {
          actor_label?: string | null
          actor_user_id?: string | null
          building_id?: string
          created_at?: string
          event_type?: string
          id?: string
          key_id?: string | null
          loan_id?: string | null
          payload?: Json
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "key_events_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_events_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_events_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "key_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_events_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "key_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      key_global_settings: {
        Row: {
          created_at: string
          id: string
          tag_template_name: string | null
          tag_template_path: string | null
          tag_template_uploaded_at: string | null
          tag_template_uploaded_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_template_name?: string | null
          tag_template_path?: string | null
          tag_template_uploaded_at?: string | null
          tag_template_uploaded_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_template_name?: string | null
          tag_template_path?: string | null
          tag_template_uploaded_at?: string | null
          tag_template_uploaded_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      key_loans: {
        Row: {
          borrower_contact_id: string | null
          borrower_email: string | null
          borrower_name: string | null
          building_id: string
          created_at: string
          due_at: string | null
          id: string
          issued_at: string
          issued_by_user_id: string | null
          notes: string | null
          overdue_reminder_sent_at: string | null
          requires_signature: boolean
          returned_at: string | null
          returned_confirmed_by_user_id: string | null
          send_confirmation_email: boolean
          send_overdue_reminder: boolean
          signature_data: string | null
          status: Database["public"]["Enums"]["key_loan_status"]
          tag_id: string
          webhook_sent_at: string | null
        }
        Insert: {
          borrower_contact_id?: string | null
          borrower_email?: string | null
          borrower_name?: string | null
          building_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          issued_at?: string
          issued_by_user_id?: string | null
          notes?: string | null
          overdue_reminder_sent_at?: string | null
          requires_signature?: boolean
          returned_at?: string | null
          returned_confirmed_by_user_id?: string | null
          send_confirmation_email?: boolean
          send_overdue_reminder?: boolean
          signature_data?: string | null
          status?: Database["public"]["Enums"]["key_loan_status"]
          tag_id: string
          webhook_sent_at?: string | null
        }
        Update: {
          borrower_contact_id?: string | null
          borrower_email?: string | null
          borrower_name?: string | null
          building_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          issued_at?: string
          issued_by_user_id?: string | null
          notes?: string | null
          overdue_reminder_sent_at?: string | null
          requires_signature?: boolean
          returned_at?: string | null
          returned_confirmed_by_user_id?: string | null
          send_confirmation_email?: boolean
          send_overdue_reminder?: boolean
          signature_data?: string | null
          status?: Database["public"]["Enums"]["key_loan_status"]
          tag_id?: string
          webhook_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "key_loans_borrower_contact_id_fkey"
            columns: ["borrower_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_loans_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_loans_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "key_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      key_manufacturers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      key_property_settings: {
        Row: {
          building_id: string
          closing_plan_name: string | null
          closing_plan_number: string | null
          closing_plan_path: string | null
          closing_plan_uploaded_at: string | null
          closing_plan_uploaded_by: string | null
          property_number: string
          tag_template_name: string | null
          tag_template_path: string | null
          tag_template_uploaded_at: string | null
          updated_at: string
        }
        Insert: {
          building_id: string
          closing_plan_name?: string | null
          closing_plan_number?: string | null
          closing_plan_path?: string | null
          closing_plan_uploaded_at?: string | null
          closing_plan_uploaded_by?: string | null
          property_number?: string
          tag_template_name?: string | null
          tag_template_path?: string | null
          tag_template_uploaded_at?: string | null
          updated_at?: string
        }
        Update: {
          building_id?: string
          closing_plan_name?: string | null
          closing_plan_number?: string | null
          closing_plan_path?: string | null
          closing_plan_uploaded_at?: string | null
          closing_plan_uploaded_by?: string | null
          property_number?: string
          tag_template_name?: string | null
          tag_template_path?: string | null
          tag_template_uploaded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_property_settings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: true
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      key_storage_locations: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      key_subject_types: {
        Row: {
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      key_tags: {
        Row: {
          building_id: string
          created_at: string
          created_by: string | null
          current_loan_id: string | null
          id: string
          key_type_id: string
          notes: string | null
          photo_path: string | null
          sequence_number: number
          storage_location_id: string
          tag_number: string
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          created_by?: string | null
          current_loan_id?: string | null
          id?: string
          key_type_id: string
          notes?: string | null
          photo_path?: string | null
          sequence_number: number
          storage_location_id: string
          tag_number: string
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          created_by?: string | null
          current_loan_id?: string | null
          id?: string
          key_type_id?: string
          notes?: string | null
          photo_path?: string | null
          sequence_number?: number
          storage_location_id?: string
          tag_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_tags_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_tags_current_loan_fk"
            columns: ["current_loan_id"]
            isOneToOne: false
            referencedRelation: "key_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_tags_key_type_id_fkey"
            columns: ["key_type_id"]
            isOneToOne: false
            referencedRelation: "key_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_tags_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "key_storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      key_types: {
        Row: {
          code_suffix: string
          color_hex: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code_suffix?: string
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code_suffix?: string
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_number: string | null
          manufacturer_id: string | null
          notes: string | null
          subject_type_id: string | null
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_number?: string | null
          manufacturer_id?: string | null
          notes?: string | null
          subject_type_id?: string | null
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_number?: string | null
          manufacturer_id?: string | null
          notes?: string | null
          subject_type_id?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "keys_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "key_manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keys_subject_type_id_fkey"
            columns: ["subject_type_id"]
            isOneToOne: false
            referencedRelation: "key_subject_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keys_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "key_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document_type: string
          document_version: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_type: string
          document_version: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_type?: string
          document_version?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      maintenance_configs: {
        Row: {
          building_id: string
          created_at: string
          custom_category: string | null
          custom_interval_months: number | null
          custom_label: string | null
          custom_lead_time_days: number | null
          id: string
          is_active: boolean
          last_generated_date: string | null
          last_maintenance_date: string | null
          maintenance_type: string
          updated_at: string
        }
        Insert: {
          building_id: string
          created_at?: string
          custom_category?: string | null
          custom_interval_months?: number | null
          custom_label?: string | null
          custom_lead_time_days?: number | null
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          last_maintenance_date?: string | null
          maintenance_type: string
          updated_at?: string
        }
        Update: {
          building_id?: string
          created_at?: string
          custom_category?: string | null
          custom_interval_months?: number | null
          custom_label?: string | null
          custom_lead_time_days?: number | null
          id?: string
          is_active?: boolean
          last_generated_date?: string | null
          last_maintenance_date?: string | null
          maintenance_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_configs_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      miete_reports: {
        Row: {
          admin_notes: string | null
          attachments: Json | null
          building_id: string | null
          case_id: string | null
          contact_address: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          internal_notes: string | null
          priority: string
          reported_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          attachments?: Json | null
          building_id?: string | null
          case_id?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          priority?: string
          reported_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          attachments?: Json | null
          building_id?: string | null
          case_id?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          priority?: string
          reported_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "miete_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          body: string | null
          created_at: string
          dedup_key: string
          id: string
          payload: Json | null
          sent_count: number
          title: string
          type: string
          url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedup_key: string
          id?: string
          payload?: Json | null
          sent_count?: number
          title: string
          type: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedup_key?: string
          id?: string
          payload?: Json | null
          sent_count?: number
          title?: string
          type?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          calendar_enabled: boolean
          calendar_lead_minutes: number
          created_at: string
          email_enabled: boolean
          in_app_email_enabled: boolean
          in_app_report_enabled: boolean
          in_app_todo_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          todo_enabled: boolean
          todo_lead_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_enabled?: boolean
          calendar_lead_minutes?: number
          created_at?: string
          email_enabled?: boolean
          in_app_email_enabled?: boolean
          in_app_report_enabled?: boolean
          in_app_todo_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          todo_enabled?: boolean
          todo_lead_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_enabled?: boolean
          calendar_lead_minutes?: number
          created_at?: string
          email_enabled?: boolean
          in_app_email_enabled?: boolean
          in_app_report_enabled?: boolean
          in_app_todo_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          todo_enabled?: boolean
          todo_lead_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_activations: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          building_id: string
          created_at: string
          deactivated_at: string | null
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          building_id: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          building_id?: string
          created_at?: string
          deactivated_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_activations_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: true
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_letter_log: {
        Row: {
          building_id: string
          campaign_id: string | null
          contact_id: string | null
          generated_at: string
          generated_by: string | null
          id: string
          initial_password_hash: string | null
          invalidated_at: string | null
          is_existing_user: boolean
          magic_link_token: string | null
          notes: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          building_id: string
          campaign_id?: string | null
          contact_id?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          initial_password_hash?: string | null
          invalidated_at?: string | null
          is_existing_user?: boolean
          magic_link_token?: string | null
          notes?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          building_id?: string
          campaign_id?: string | null
          contact_id?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          initial_password_hash?: string | null
          invalidated_at?: string | null
          is_existing_user?: boolean
          magic_link_token?: string | null
          notes?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_letter_log_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_letter_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_magic_links: {
        Row: {
          building_id: string | null
          created_at: string
          expires_at: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          expires_at: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          building_id?: string | null
          created_at?: string
          expires_at?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_magic_links_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          applies_to_all_assignments: boolean
          building_id: string
          contact_id: string | null
          created_at: string
          current_step: number
          fab_dismissed_at: string | null
          fully_completed_at: string | null
          id: string
          is_repeat_owner: boolean
          step_data: Json
          step1_completed_at: string | null
          step2_completed_at: string | null
          step3_completed_at: string | null
          step4_completed_at: string | null
          step5_completed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          applies_to_all_assignments?: boolean
          building_id: string
          contact_id?: string | null
          created_at?: string
          current_step?: number
          fab_dismissed_at?: string | null
          fully_completed_at?: string | null
          id?: string
          is_repeat_owner?: boolean
          step_data?: Json
          step1_completed_at?: string | null
          step2_completed_at?: string | null
          step3_completed_at?: string | null
          step4_completed_at?: string | null
          step5_completed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          applies_to_all_assignments?: boolean
          building_id?: string
          contact_id?: string | null
          created_at?: string
          current_step?: number
          fab_dismissed_at?: string | null
          fully_completed_at?: string | null
          id?: string
          is_repeat_owner?: boolean
          step_data?: Json
          step1_completed_at?: string | null
          step2_completed_at?: string | null
          step3_completed_at?: string | null
          step4_completed_at?: string | null
          step5_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_progress_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_submissions: {
        Row: {
          applied_fields: Json
          assignment_id: string | null
          building_id: string
          category: string
          contact_id: string | null
          created_at: string
          id: string
          payload: Json
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_fields?: Json
          assignment_id?: string | null
          building_id: string
          category: string
          contact_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_fields?: Json
          assignment_id?: string | null
          building_id?: string
          category?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_submissions_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      process_instance_steps: {
        Row: {
          assignee_user_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_calendar_event_id: string | null
          created_todo_id: string | null
          description: string | null
          due_date: string | null
          id: string
          instance_id: string
          is_completed: boolean
          notes: string | null
          position: number
          template_step_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_calendar_event_id?: string | null
          created_todo_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          instance_id: string
          is_completed?: boolean
          notes?: string | null
          position?: number
          template_step_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_calendar_event_id?: string | null
          created_todo_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          instance_id?: string
          is_completed?: boolean
          notes?: string | null
          position?: number
          template_step_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_instance_steps_created_calendar_event_id_fkey"
            columns: ["created_calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_instance_steps_created_todo_id_fkey"
            columns: ["created_todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_instance_steps_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "process_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_instance_steps_template_step_id_fkey"
            columns: ["template_step_id"]
            isOneToOne: false
            referencedRelation: "process_template_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      process_instances: {
        Row: {
          building_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          owner_user_id: string | null
          started_at: string
          status: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          owner_user_id?: string | null
          started_at?: string
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          owner_user_id?: string | null
          started_at?: string
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_instances_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_instances_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      process_step_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          instance_step_id: string
          mime_type: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          instance_step_id: string
          mime_type?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          instance_step_id?: string
          mime_type?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_step_attachments_instance_step_id_fkey"
            columns: ["instance_step_id"]
            isOneToOne: false
            referencedRelation: "process_instance_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      process_template_steps: {
        Row: {
          created_at: string
          default_creates_calendar_event: boolean
          default_creates_todo: boolean
          description: string | null
          id: string
          position: number
          suggested_offset_days: number | null
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_creates_calendar_event?: boolean
          default_creates_todo?: boolean
          description?: string | null
          id?: string
          position?: number
          suggested_offset_days?: number | null
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_creates_calendar_event?: boolean
          default_creates_todo?: boolean
          description?: string | null
          id?: string
          position?: number
          suggested_offset_days?: number | null
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "process_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      process_templates: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      processes: {
        Row: {
          building_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_pseudo_email: string | null
          broker_mode_enabled: boolean
          building_id: string | null
          created_at: string | null
          email: string
          first_name: string | null
          force_password_change: boolean | null
          id: string
          initial_password_set_at: string | null
          last_name: string | null
          mfa_required: boolean
          must_change_password: boolean | null
          passkey_prompt_dismissed_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          terms_accepted_at: string | null
          updated_at: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          auth_pseudo_email?: string | null
          broker_mode_enabled?: boolean
          building_id?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          force_password_change?: boolean | null
          id?: string
          initial_password_set_at?: string | null
          last_name?: string | null
          mfa_required?: boolean
          must_change_password?: boolean | null
          passkey_prompt_dismissed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          terms_accepted_at?: string | null
          updated_at?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          auth_pseudo_email?: string | null
          broker_mode_enabled?: boolean
          building_id?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          force_password_change?: boolean | null
          id?: string
          initial_password_set_at?: string | null
          last_name?: string | null
          mfa_required?: boolean
          must_change_password?: boolean | null
          passkey_prompt_dismissed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          terms_accepted_at?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      prompt_favorites: {
        Row: {
          created_at: string
          id: string
          prompt_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prompt_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          prompt_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_favorites_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          category_id: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          sort_order: number | null
          title: string
        }
        Insert: {
          category_id?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          sort_order?: number | null
          title: string
        }
        Update: {
          category_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          sort_order?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "prompt_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_label: string | null
          endpoint: string
          id: string
          last_delivery_at: string | null
          last_delivery_code: number | null
          last_delivery_detail: string | null
          last_delivery_status: string | null
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
          vapid_fingerprint: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: string
          last_delivery_at?: string | null
          last_delivery_code?: number | null
          last_delivery_detail?: string | null
          last_delivery_status?: string | null
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
          vapid_fingerprint?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: string
          last_delivery_at?: string | null
          last_delivery_code?: number | null
          last_delivery_detail?: string | null
          last_delivery_status?: string | null
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
          vapid_fingerprint?: string | null
        }
        Relationships: []
      }
      report_templates: {
        Row: {
          background_pdf_url: string | null
          building_id: string | null
          content: string | null
          created_at: string
          footer_html: string | null
          header_html: string | null
          id: string
          is_default: boolean | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          margins: Json | null
          name: string
          type: string | null
          updated_at: string
        }
        Insert: {
          background_pdf_url?: string | null
          building_id?: string | null
          content?: string | null
          created_at?: string
          footer_html?: string | null
          header_html?: string | null
          id?: string
          is_default?: boolean | null
          management_mode: Database["public"]["Enums"]["management_mode"]
          margins?: Json | null
          name: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          background_pdf_url?: string | null
          building_id?: string | null
          content?: string | null
          created_at?: string
          footer_html?: string | null
          header_html?: string | null
          id?: string
          is_default?: boolean | null
          management_mode?: Database["public"]["Enums"]["management_mode"]
          margins?: Json | null
          name?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      rgi_clients: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          building_id: string | null
          city: string | null
          contact_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          customer_no: string | null
          default_hourly_rate: number | null
          default_payment_terms_days: number | null
          email: string | null
          id: string
          name: string
          notes: string | null
          type: Database["public"]["Enums"]["rgi_client_type"]
          updated_at: string
          vat_id: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          building_id?: string | null
          city?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_no?: string | null
          default_hourly_rate?: number | null
          default_payment_terms_days?: number | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          type?: Database["public"]["Enums"]["rgi_client_type"]
          updated_at?: string
          vat_id?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          building_id?: string | null
          city?: string | null
          contact_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          customer_no?: string | null
          default_hourly_rate?: number | null
          default_payment_terms_days?: number | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["rgi_client_type"]
          updated_at?: string
          vat_id?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rgi_clients_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rgi_clients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      rgi_company_settings: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bank_name: string | null
          bic: string | null
          ceo: string | null
          city: string | null
          country: string | null
          court: string | null
          created_at: string
          default_footer_text: string | null
          default_payment_terms_days: number
          email: string | null
          hrb: string | null
          iban: string | null
          id: string
          invoice_number_pattern: string
          legal_name: string
          phone: string | null
          reminder_fee_l1: number | null
          reminder_fee_l2: number | null
          reminder_fee_l3: number | null
          tax_no: string | null
          updated_at: string
          vat_id: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bank_name?: string | null
          bic?: string | null
          ceo?: string | null
          city?: string | null
          country?: string | null
          court?: string | null
          created_at?: string
          default_footer_text?: string | null
          default_payment_terms_days?: number
          email?: string | null
          hrb?: string | null
          iban?: string | null
          id?: string
          invoice_number_pattern?: string
          legal_name?: string
          phone?: string | null
          reminder_fee_l1?: number | null
          reminder_fee_l2?: number | null
          reminder_fee_l3?: number | null
          tax_no?: string | null
          updated_at?: string
          vat_id?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bank_name?: string | null
          bic?: string | null
          ceo?: string | null
          city?: string | null
          country?: string | null
          court?: string | null
          created_at?: string
          default_footer_text?: string | null
          default_payment_terms_days?: number
          email?: string | null
          hrb?: string | null
          iban?: string | null
          id?: string
          invoice_number_pattern?: string
          legal_name?: string
          phone?: string | null
          reminder_fee_l1?: number | null
          reminder_fee_l2?: number | null
          reminder_fee_l3?: number | null
          tax_no?: string | null
          updated_at?: string
          vat_id?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      rgi_invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          kind: Database["public"]["Enums"]["rgi_invoice_item_kind"]
          line_gross: number
          line_net: number
          line_vat: number
          position: number
          quantity: number
          source_time_entry_ids: string[] | null
          unit: string | null
          unit_price_net: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          kind?: Database["public"]["Enums"]["rgi_invoice_item_kind"]
          line_gross?: number
          line_net?: number
          line_vat?: number
          position?: number
          quantity?: number
          source_time_entry_ids?: string[] | null
          unit?: string | null
          unit_price_net?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          kind?: Database["public"]["Enums"]["rgi_invoice_item_kind"]
          line_gross?: number
          line_net?: number
          line_vat?: number
          position?: number
          quantity?: number
          source_time_entry_ids?: string[] | null
          unit?: string | null
          unit_price_net?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "rgi_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rgi_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      rgi_invoice_sequences: {
        Row: {
          last_no: number
          scope: string
          year: number
        }
        Insert: {
          last_no?: number
          scope: string
          year: number
        }
        Update: {
          last_no?: number
          scope?: string
          year?: number
        }
        Relationships: []
      }
      rgi_invoice_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          placeholder_schema: Json | null
          sparte: Database["public"]["Enums"]["rgi_sparte"] | null
          storage_path: string
          template_kind: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          placeholder_schema?: Json | null
          sparte?: Database["public"]["Enums"]["rgi_sparte"] | null
          storage_path: string
          template_kind?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          placeholder_schema?: Json | null
          sparte?: Database["public"]["Enums"]["rgi_sparte"] | null
          storage_path?: string
          template_kind?: string
        }
        Relationships: []
      }
      rgi_invoices: {
        Row: {
          cancels_invoice_id: string | null
          client_address_snapshot: string | null
          client_id: string
          client_name_snapshot: string | null
          created_at: string
          created_by: string | null
          docx_storage_path: string | null
          due_date: string | null
          footer_text: string | null
          id: string
          intro_text: string | null
          invoice_number: string | null
          issue_date: string
          paid_amount: number
          paid_at: string | null
          pdf_storage_path: string | null
          project_id: string | null
          sent_at: string | null
          service_period_from: string | null
          service_period_to: string | null
          status: Database["public"]["Enums"]["rgi_invoice_status"]
          subtotal_net: number
          template_id: string | null
          total_gross: number
          updated_at: string
          vat_total: number
        }
        Insert: {
          cancels_invoice_id?: string | null
          client_address_snapshot?: string | null
          client_id: string
          client_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          docx_storage_path?: string | null
          due_date?: string | null
          footer_text?: string | null
          id?: string
          intro_text?: string | null
          invoice_number?: string | null
          issue_date?: string
          paid_amount?: number
          paid_at?: string | null
          pdf_storage_path?: string | null
          project_id?: string | null
          sent_at?: string | null
          service_period_from?: string | null
          service_period_to?: string | null
          status?: Database["public"]["Enums"]["rgi_invoice_status"]
          subtotal_net?: number
          template_id?: string | null
          total_gross?: number
          updated_at?: string
          vat_total?: number
        }
        Update: {
          cancels_invoice_id?: string | null
          client_address_snapshot?: string | null
          client_id?: string
          client_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          docx_storage_path?: string | null
          due_date?: string | null
          footer_text?: string | null
          id?: string
          intro_text?: string | null
          invoice_number?: string | null
          issue_date?: string
          paid_amount?: number
          paid_at?: string | null
          pdf_storage_path?: string | null
          project_id?: string | null
          sent_at?: string | null
          service_period_from?: string | null
          service_period_to?: string | null
          status?: Database["public"]["Enums"]["rgi_invoice_status"]
          subtotal_net?: number
          template_id?: string | null
          total_gross?: number
          updated_at?: string
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "rgi_invoices_cancels_invoice_id_fkey"
            columns: ["cancels_invoice_id"]
            isOneToOne: false
            referencedRelation: "rgi_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rgi_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rgi_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rgi_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "rgi_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rgi_invoices_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rgi_invoice_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rgi_item_presets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json
          name: string
          sparte: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          name: string
          sparte?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          name?: string
          sparte?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rgi_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          note: string | null
          paid_on: string
          source: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          note?: string | null
          paid_on?: string
          source?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          note?: string | null
          paid_on?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "rgi_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rgi_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      rgi_projects: {
        Row: {
          client_id: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          default_hourly_rate: number | null
          id: string
          name: string
          notes: string | null
          sparte: Database["public"]["Enums"]["rgi_sparte"]
          started_at: string | null
          status: Database["public"]["Enums"]["rgi_project_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          default_hourly_rate?: number | null
          id?: string
          name: string
          notes?: string | null
          sparte?: Database["public"]["Enums"]["rgi_sparte"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["rgi_project_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          default_hourly_rate?: number | null
          id?: string
          name?: string
          notes?: string | null
          sparte?: Database["public"]["Enums"]["rgi_sparte"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["rgi_project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rgi_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rgi_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      rgi_reminders: {
        Row: {
          created_at: string
          created_by: string | null
          fee: number
          id: string
          invoice_id: string
          level: number
          pdf_storage_path: string | null
          sent_on: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fee?: number
          id?: string
          invoice_id: string
          level: number
          pdf_storage_path?: string | null
          sent_on?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fee?: number
          id?: string
          invoice_id?: string
          level?: number
          pdf_storage_path?: string | null
          sent_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "rgi_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rgi_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      rgi_time_entries: {
        Row: {
          billable: boolean
          created_at: string
          date: string | null
          description: string
          hourly_rate: number | null
          id: string
          invoice_item_id: string | null
          minutes: number
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billable?: boolean
          created_at?: string
          date?: string | null
          description: string
          hourly_rate?: number | null
          id?: string
          invoice_item_id?: string | null
          minutes: number
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billable?: boolean
          created_at?: string
          date?: string | null
          description?: string
          hourly_rate?: number | null
          id?: string
          invoice_item_id?: string | null
          minutes?: number
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rgi_time_entries_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "rgi_invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rgi_time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "rgi_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_emails: {
        Row: {
          account_id: string
          attachments: Json
          bcc_addresses: string[] | null
          body_html: string | null
          body_text: string
          cc_addresses: string[] | null
          created_at: string
          error_message: string | null
          id: string
          reply_to_message_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string
          to_addresses: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          attachments?: Json
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_text?: string
          cc_addresses?: string[] | null
          created_at?: string
          error_message?: string | null
          id?: string
          reply_to_message_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_addresses: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          attachments?: Json
          bcc_addresses?: string[] | null
          body_html?: string | null
          body_text?: string
          cc_addresses?: string[] | null
          created_at?: string
          error_message?: string | null
          id?: string
          reply_to_message_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_addresses?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_emails_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sepa_mandate_audit_log: {
        Row: {
          accepted: boolean
          accepted_at: string
          account_holder: string | null
          building_id: string | null
          contact_id: string | null
          created_at: string
          creditor_id: string | null
          creditor_name: string | null
          event_type: string
          iban: string | null
          id: string
          ip_address: unknown
          mandate_reference: string | null
          mandate_text: string
          mandate_text_hash: string
          metadata: Json
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted: boolean
          accepted_at?: string
          account_holder?: string | null
          building_id?: string | null
          contact_id?: string | null
          created_at?: string
          creditor_id?: string | null
          creditor_name?: string | null
          event_type: string
          iban?: string | null
          id?: string
          ip_address?: unknown
          mandate_reference?: string | null
          mandate_text: string
          mandate_text_hash: string
          metadata?: Json
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted?: boolean
          accepted_at?: string
          account_holder?: string | null
          building_id?: string | null
          contact_id?: string | null
          created_at?: string
          creditor_id?: string | null
          creditor_name?: string | null
          event_type?: string
          iban?: string | null
          id?: string
          ip_address?: unknown
          mandate_reference?: string | null
          mandate_text?: string
          mandate_text_hash?: string
          metadata?: Json
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      service_orders: {
        Row: {
          agb_version: string
          assignment_id: string | null
          created_at: string
          currency: string
          document_error: string | null
          document_paths: Json | null
          document_ready_at: string | null
          document_storage_path: string | null
          fiscal_year: number | null
          id: string
          input_snapshot: Json
          ip_address: string | null
          paid_at: string | null
          price_cents: number
          privacy_version: string
          quantity: number
          service_type: Database["public"]["Enums"]["service_type_enum"]
          status: Database["public"]["Enums"]["service_order_status_enum"]
          stripe_invoice_hosted_url: string | null
          stripe_invoice_id: string | null
          stripe_invoice_pdf_url: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
          widerruf_waiver_confirmed: boolean
        }
        Insert: {
          agb_version: string
          assignment_id?: string | null
          created_at?: string
          currency?: string
          document_error?: string | null
          document_paths?: Json | null
          document_ready_at?: string | null
          document_storage_path?: string | null
          fiscal_year?: number | null
          id?: string
          input_snapshot?: Json
          ip_address?: string | null
          paid_at?: string | null
          price_cents: number
          privacy_version: string
          quantity?: number
          service_type: Database["public"]["Enums"]["service_type_enum"]
          status?: Database["public"]["Enums"]["service_order_status_enum"]
          stripe_invoice_hosted_url?: string | null
          stripe_invoice_id?: string | null
          stripe_invoice_pdf_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
          widerruf_waiver_confirmed?: boolean
        }
        Update: {
          agb_version?: string
          assignment_id?: string | null
          created_at?: string
          currency?: string
          document_error?: string | null
          document_paths?: Json | null
          document_ready_at?: string | null
          document_storage_path?: string | null
          fiscal_year?: number | null
          id?: string
          input_snapshot?: Json
          ip_address?: string | null
          paid_at?: string | null
          price_cents?: number
          privacy_version?: string
          quantity?: number
          service_type?: Database["public"]["Enums"]["service_type_enum"]
          status?: Database["public"]["Enums"]["service_order_status_enum"]
          stripe_invoice_hosted_url?: string | null
          stripe_invoice_id?: string | null
          stripe_invoice_pdf_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          widerruf_waiver_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      service_owner_costs: {
        Row: {
          amount: number
          assignment_id: string
          cost_type: string
          created_at: string
          fiscal_year: number
          id: string
          label: string | null
          note: string | null
          prorata_exempt: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          assignment_id: string
          cost_type: string
          created_at?: string
          fiscal_year: number
          id?: string
          label?: string | null
          note?: string | null
          prorata_exempt?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          assignment_id?: string
          cost_type?: string
          created_at?: string
          fiscal_year?: number
          id?: string
          label?: string | null
          note?: string | null
          prorata_exempt?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_owner_costs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      service_pricing: {
        Row: {
          active: boolean
          currency: string
          price_cents: number
          service_type: Database["public"]["Enums"]["service_type_enum"]
          stripe_price_id: string | null
          tax_behavior: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          currency?: string
          price_cents: number
          service_type: Database["public"]["Enums"]["service_type_enum"]
          stripe_price_id?: string | null
          tax_behavior?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          currency?: string
          price_cents?: number
          service_type?: Database["public"]["Enums"]["service_type_enum"]
          stripe_price_id?: string | null
          tax_behavior?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_provider_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      service_tenancies: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          move_in: string | null
          move_out: string | null
          nk_prepayment_monthly: number | null
          note: string | null
          persons: number | null
          tenant_address: string | null
          tenant_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          move_in?: string | null
          move_out?: string | null
          nk_prepayment_monthly?: number | null
          note?: string | null
          persons?: number | null
          tenant_address?: string | null
          tenant_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          move_in?: string | null
          move_out?: string | null
          nk_prepayment_monthly?: number | null
          note?: string | null
          persons?: number | null
          tenant_address?: string | null
          tenant_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_tenancies_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_deposits: {
        Row: {
          amount: number
          assignment_id: string
          bank_name: string | null
          created_at: string
          deposit_type: string
          guarantee_expiry: string | null
          guarantee_number: string | null
          guarantor: string | null
          iban: string | null
          id: string
          notes: string | null
          received_on: string | null
          released_on: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          assignment_id: string
          bank_name?: string | null
          created_at?: string
          deposit_type: string
          guarantee_expiry?: string | null
          guarantee_number?: string | null
          guarantor?: string | null
          iban?: string | null
          id?: string
          notes?: string | null
          received_on?: string | null
          released_on?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          assignment_id?: string
          bank_name?: string | null
          created_at?: string
          deposit_type?: string
          guarantee_expiry?: string | null
          guarantee_number?: string | null
          guarantor?: string | null
          iban?: string | null
          id?: string
          notes?: string | null
          received_on?: string | null
          released_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_deposits_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "contact_building_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          building_id: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          building_id: string
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          building_id?: string
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          ended_at: string | null
          id: string
          note: string | null
          reason: string | null
          source: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          ended_at?: string | null
          id?: string
          note?: string | null
          reason?: string | null
          source?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          ended_at?: string | null
          id?: string
          note?: string | null
          reason?: string | null
          source?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todo_assignees: {
        Row: {
          created_at: string | null
          id: string
          todo_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          todo_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          todo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_assignees_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      todo_buildings: {
        Row: {
          building_id: string
          created_at: string | null
          id: string
          todo_id: string
        }
        Insert: {
          building_id: string
          created_at?: string | null
          id?: string
          todo_id: string
        }
        Update: {
          building_id?: string
          created_at?: string | null
          id?: string
          todo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_buildings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_buildings_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_categories: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      todo_comments: {
        Row: {
          content: string
          created_at: string | null
          created_by: string
          id: string
          todo_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by: string
          id?: string
          todo_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string
          id?: string
          todo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "todo_comments_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_subtasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string
          id: string
          is_completed: boolean | null
          sort_order: number | null
          title: string
          todo_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by: string
          id?: string
          is_completed?: boolean | null
          sort_order?: number | null
          title: string
          todo_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string
          id?: string
          is_completed?: boolean | null
          sort_order?: number | null
          title?: string
          todo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_subtasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "todo_subtasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "todo_subtasks_todo_id_fkey"
            columns: ["todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          assigned_to: string | null
          attachments: Json | null
          building_id: string | null
          calendar_end_time: string | null
          calendar_start_time: string | null
          category_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_internal: boolean
          is_maintenance_task: boolean
          is_recurring: boolean | null
          maintenance_type: string | null
          parent_todo_id: string | null
          priority: string
          recurrence_end_date: string | null
          recurrence_interval: number | null
          recurrence_pattern: string | null
          show_in_calendar: boolean | null
          show_in_list_date: string | null
          status: string
          task_number: number
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json | null
          building_id?: string | null
          calendar_end_time?: string | null
          calendar_start_time?: string | null
          category_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_internal?: boolean
          is_maintenance_task?: boolean
          is_recurring?: boolean | null
          maintenance_type?: string | null
          parent_todo_id?: string | null
          priority?: string
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_pattern?: string | null
          show_in_calendar?: boolean | null
          show_in_list_date?: string | null
          status?: string
          task_number?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json | null
          building_id?: string | null
          calendar_end_time?: string | null
          calendar_start_time?: string | null
          category_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_internal?: boolean
          is_maintenance_task?: boolean
          is_recurring?: boolean | null
          maintenance_type?: string | null
          parent_todo_id?: string | null
          priority?: string
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_pattern?: string | null
          show_in_calendar?: boolean | null
          show_in_list_date?: string | null
          status?: string
          task_number?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todos_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "todos_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "todo_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "todos_parent_todo_id_fkey"
            columns: ["parent_todo_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tour_progress: {
        Row: {
          progress: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          progress?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          progress?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      utility_contracts: {
        Row: {
          building_id: string
          contract_number: string | null
          created_at: string | null
          expense_account_id: string | null
          id: string
          installment_amount: number | null
          installment_interval: string | null
          meter_number: string | null
          notes: string | null
          period_from: string | null
          period_to: string | null
          prepayment_account_id: string | null
          status: string | null
          updated_at: string | null
          utility_type: Database["public"]["Enums"]["utility_type"]
          vendor_iban: string | null
          vendor_name: string
        }
        Insert: {
          building_id: string
          contract_number?: string | null
          created_at?: string | null
          expense_account_id?: string | null
          id?: string
          installment_amount?: number | null
          installment_interval?: string | null
          meter_number?: string | null
          notes?: string | null
          period_from?: string | null
          period_to?: string | null
          prepayment_account_id?: string | null
          status?: string | null
          updated_at?: string | null
          utility_type: Database["public"]["Enums"]["utility_type"]
          vendor_iban?: string | null
          vendor_name: string
        }
        Update: {
          building_id?: string
          contract_number?: string | null
          created_at?: string | null
          expense_account_id?: string | null
          id?: string
          installment_amount?: number | null
          installment_interval?: string | null
          meter_number?: string | null
          notes?: string | null
          period_from?: string | null
          period_to?: string | null
          prepayment_account_id?: string | null
          status?: string | null
          updated_at?: string | null
          utility_type?: Database["public"]["Enums"]["utility_type"]
          vendor_iban?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "utility_contracts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utility_contracts_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utility_contracts_prepayment_account_id_fkey"
            columns: ["prepayment_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_aliases: {
        Row: {
          building_id: string | null
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          raw_pattern: string
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          raw_pattern: string
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          raw_pattern?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_aliases_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_memory: {
        Row: {
          account_category: string | null
          account_number: string
          created_at: string
          id: string
          is_35a_relevant: boolean | null
          last_used_at: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          purpose_pattern: string | null
          usage_count: number
          vendor_iban: string | null
          vendor_name_normalized: string
        }
        Insert: {
          account_category?: string | null
          account_number: string
          created_at?: string
          id?: string
          is_35a_relevant?: boolean | null
          last_used_at?: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          purpose_pattern?: string | null
          usage_count?: number
          vendor_iban?: string | null
          vendor_name_normalized?: string
        }
        Update: {
          account_category?: string | null
          account_number?: string
          created_at?: string
          id?: string
          is_35a_relevant?: boolean | null
          last_used_at?: string
          management_mode?: Database["public"]["Enums"]["management_mode"]
          purpose_pattern?: string | null
          usage_count?: number
          vendor_iban?: string | null
          vendor_name_normalized?: string
        }
        Relationships: []
      }
      weg_owner_buildings: {
        Row: {
          building_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          building_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          building_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_weg_owner_buildings_building_id"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      weg_owners: {
        Row: {
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      weg_reports: {
        Row: {
          admin_notes: string | null
          attachments: Json | null
          building_id: string | null
          case_id: string | null
          contact_address: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          internal_notes: string | null
          reported_by: string | null
          status: string
          title: string
          updated_at: string
          weg_owner_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          attachments?: Json | null
          building_id?: string | null
          case_id?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          reported_by?: string | null
          status?: string
          title: string
          updated_at?: string
          weg_owner_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          attachments?: Json | null
          building_id?: string | null
          case_id?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          reported_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          weg_owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weg_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_account_movements: {
        Row: {
          account_id: string | null
          amount: number | null
          amount_35a: number | null
          booking_category: string | null
          booking_date: string | null
          booking_id: string | null
          building_id: string | null
          description: string | null
          fiscal_year: number | null
          is_35a_relevant: boolean | null
          receipt_number: string | null
          side: string | null
          source: string | null
          status: string | null
        }
        Relationships: []
      }
      v_annual_cycle_overview: {
        Row: {
          building_id: string | null
          building_name: string | null
          done_count: number | null
          fiscal_year_end: string | null
          fiscal_year_start: string | null
          in_progress_count: number | null
          management_mode: Database["public"]["Enums"]["management_mode"] | null
          open_count: number | null
          tasks: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "annual_cycle_tasks_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_building_manager: {
        Args: { building_id_param: string; user_id_param: string }
        Returns: undefined
      }
      book_split_transaction: {
        Args: { p_bank_transaction_id: string; p_bookings: Json }
        Returns: Json
      }
      calculate_account_balance_at: {
        Args: { p_account_id: string; p_building_id: string; p_date: string }
        Returns: number
      }
      cleanup_orphan_split_bookings: {
        Args: { p_bank_transaction_id: string }
        Returns: Json
      }
      count_building_managers: {
        Args: { building_id_param: string }
        Returns: number
      }
      delete_booking_with_cleanup: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      ensure_broker_categories: {
        Args: { p_property_id: string }
        Returns: undefined
      }
      ensure_stammakte_categories: {
        Args: { p_building_id: string }
        Returns: undefined
      }
      find_contact_by_phone: {
        Args: { p_num: string }
        Returns: {
          contact_id: string
          label: string
          name: string
          objekte: string
          phone: string
        }[]
      }
      find_similar_bookings: {
        Args: {
          p_building_id: string
          p_include_other_buildings?: boolean
          p_management_mode: Database["public"]["Enums"]["management_mode"]
          p_match_count?: number
          p_similarity_threshold?: number
          query_embedding: string
        }
        Returns: {
          account_name: string
          account_number: string
          amount: number
          booking_description: string
          booking_type: string
          counter_account_name: string
          counter_account_number: string
          creditor_name: string
          id: string
          is_35a_relevant: boolean
          purpose_text: string
          scope: string
          similarity: number
          source: string
        }[]
      }
      find_vendor_memory: {
        Args: {
          p_management_mode: Database["public"]["Enums"]["management_mode"]
          p_vendor_iban: string
          p_vendor_name: string
        }
        Returns: {
          account_category: string
          account_number: string
          is_35a_relevant: boolean
          purpose_pattern: string
          usage_count: number
        }[]
      }
      force_logout_staff: { Args: never; Returns: undefined }
      generate_building_code: {
        Args: {
          management_mode_param: Database["public"]["Enums"]["management_mode"]
        }
        Returns: string
      }
      get_attendee_by_proxy_token: { Args: { p_token: string }; Returns: Json }
      get_audit_accounts_by_token: {
        Args: { p_token: string }
        Returns: Json[]
      }
      get_audit_balances_by_token: {
        Args: { p_token: string }
        Returns: Json[]
      }
      get_audit_bank_statement_pdfs_by_token: {
        Args: { p_token: string }
        Returns: Json[]
      }
      get_audit_bookings_by_token: {
        Args: { p_token: string }
        Returns: Json[]
      }
      get_audit_by_token: { Args: { p_token: string }; Returns: Json }
      get_audit_invoices_by_token: {
        Args: { p_token: string }
        Returns: Json[]
      }
      get_audit_notes_by_token: { Args: { p_token: string }; Returns: Json[] }
      get_audit_pdf_statements_by_token: {
        Args: { p_token: string }
        Returns: Json[]
      }
      get_audit_statements_by_token: {
        Args: { p_token: string }
        Returns: Json[]
      }
      get_audit_templates_by_token: {
        Args: { p_token: string }
        Returns: Json[]
      }
      get_building_dashboard_stats: {
        Args: { p_building_id: string }
        Returns: Json
      }
      get_building_manager_names: {
        Args: { building_id_param: string }
        Returns: string[]
      }
      get_building_managers: {
        Args: { building_id_param: string }
        Returns: {
          email: string
          first_name: string
          last_name: string
          manager_id: string
          user_id: string
        }[]
      }
      get_building_overview: { Args: { p_building_id: string }; Returns: Json }
      get_category_path: {
        Args: { _category_id: string }
        Returns: {
          name_path: string[]
          slug_path: string[]
        }[]
      }
      get_category_taxonomy: {
        Args: { p_building_id?: string }
        Returns: {
          building_id: string
          category_id: string
          name: string
          parent_id: string
          path: string[]
          slug: string
        }[]
      }
      get_dashboard_global_stats: {
        Args: {
          p_management_mode: Database["public"]["Enums"]["management_mode"]
        }
        Returns: Json
      }
      get_owner_assignments_in_user_buildings: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_owner_contact_ids_in_user_buildings: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_owner_resolution_last_edits: {
        Args: { _resolution_ids: string[] }
        Returns: {
          last_edit: string
          resolution_id: string
        }[]
      }
      get_proxy_meeting_state: { Args: { p_token: string }; Returns: Json }
      get_service_provider_pool: {
        Args: never
        Returns: {
          categories: string[]
          id: string
          name: string
        }[]
      }
      get_user_building_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_role: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_broker_access: { Args: { _user_id: string }; Returns: boolean }
      is_emergency_contact_for_user: {
        Args: { _contact_id: string; _user_id: string }
        Returns: boolean
      }
      normalize_phone_last8: { Args: { p: string }; Returns: string }
      remove_building_manager: {
        Args: { manager_id_param: string }
        Returns: undefined
      }
      remove_push_subscription: {
        Args: { endpoint_param: string; user_id_param: string }
        Returns: undefined
      }
      rgi_is_admin: { Args: { _user_id: string }; Returns: boolean }
      rgi_mark_overdue: { Args: never; Returns: number }
      rgi_next_invoice_number: {
        Args: { p_sparte?: Database["public"]["Enums"]["rgi_sparte"] }
        Returns: string
      }
      save_push_subscription: {
        Args: {
          auth_param: string
          endpoint_param: string
          p256dh_param: string
          user_id_param: string
        }
        Returns: undefined
      }
      search_chunks_by_category: {
        Args: {
          p_building_id?: string
          p_category_slugs?: string[]
          p_match_count?: number
          p_min_similarity?: number
          p_query_embedding: string
        }
        Returns: {
          building_id: string
          category_id: string
          category_path: string[]
          category_slug: string
          chunk_id: string
          content: string
          display_name: string
          file_id: string
          file_path: string
          metadata: Json
          similarity: number
        }[]
      }
      search_document_chunks:
        | {
            Args: {
              filter_building_id?: string
              include_general?: boolean
              match_count?: number
              query_embedding: string
            }
            Returns: {
              building_id: string
              category: string
              content: string
              document_id: string
              id: string
              metadata: Json
              similarity: number
            }[]
          }
        | {
            Args: {
              filter_building_id?: string
              include_general?: boolean
              match_count?: number
              query_embedding: string
              search_all_buildings?: boolean
            }
            Returns: {
              building_id: string
              category: string
              content: string
              document_id: string
              id: string
              metadata: Json
              similarity: number
            }[]
          }
      search_document_chunks_with_metadata: {
        Args: {
          filter_building_id?: string
          filter_categories?: string[]
          filter_features?: string[]
          include_general?: boolean
          match_count?: number
          query_embedding: string
          search_all_buildings?: boolean
        }
        Returns: {
          building_id: string
          category: string
          content: string
          document_id: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      search_emails: {
        Args: {
          p_account_ids?: string[]
          p_assigned_filter?: string
          p_assigned_to?: string
          p_limit?: number
          p_offset?: number
          p_search: string
        }
        Returns: {
          account_id: string
          ai_case_confidence: number | null
          ai_case_suggestion_id: string | null
          ai_category: string | null
          ai_classified_at: string | null
          ai_priority: string | null
          ai_summary: string | null
          assigned_to: string | null
          attachments_incomplete: boolean
          bcc_addresses: Json | null
          body_html: string | null
          body_text: string | null
          broker_lead_id: string | null
          broker_property_id: string | null
          building_id: string | null
          case_id: string | null
          cc_addresses: Json | null
          contact_id: string | null
          contact_person_id: string | null
          created_at: string
          date: string | null
          deleted_at: string | null
          etv_agenda_item_id: string | null
          etv_meeting_id: string | null
          folder_id: string | null
          from_address: string | null
          from_name: string | null
          has_attachments: boolean
          id: string
          imap_uid: string | null
          in_reply_to: string | null
          is_archived: boolean
          is_draft: boolean
          is_etv_relevant: boolean
          is_pinned: boolean
          is_read: boolean
          is_starred: boolean
          message_id: string | null
          message_id_header: string | null
          pinned_at: string | null
          process_id: string | null
          subject: string | null
          thread_id: string | null
          to_addresses: Json | null
          to_names: string[] | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "emails"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      seed_annual_cycle_tasks: {
        Args: {
          p_building_id: string
          p_fiscal_year_end: string
          p_fiscal_year_start: string
        }
        Returns: undefined
      }
      update_audit_by_token: {
        Args: {
          p_notes?: string
          p_progress?: Json
          p_signature_data?: string
          p_status?: string
          p_token: string
        }
        Returns: Json
      }
      user_can_access_building: {
        Args: { _building_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_admin_access: { Args: { user_id: string }; Returns: boolean }
      vendor_memory_upsert: {
        Args: {
          p_account_category: string
          p_account_number: string
          p_is_35a: boolean
          p_management_mode: Database["public"]["Enums"]["management_mode"]
          p_purpose_pattern: string
          p_vendor_iban: string
          p_vendor_name_normalized: string
        }
        Returns: undefined
      }
    }
    Enums: {
      annual_cycle_status: "open" | "in_progress" | "done"
      app_role: "admin" | "weg_owner" | "tenant" | "employee"
      billing_mode: "own_billing" | "distribution_only"
      case_category:
        | "schaden"
        | "versicherung"
        | "maengel"
        | "eigentuemerwechsel"
        | "rechtliches"
        | "instandhaltung"
        | "sonstiges"
      case_event_type:
        | "note"
        | "email"
        | "document"
        | "image"
        | "todo"
        | "booking"
        | "meeting"
        | "phone"
        | "status_change"
        | "ai_summary"
        | "file"
      case_participant_role:
        | "geschaedigter"
        | "verursacher"
        | "gutachter"
        | "versicherer"
        | "handwerker"
        | "eigentuemer"
        | "mieter"
        | "behoerde"
        | "sonstiges"
      case_priority: "low" | "medium" | "high" | "urgent"
      case_status:
        | "open"
        | "in_progress"
        | "waiting_external"
        | "waiting_owner"
        | "resolved"
        | "archived"
      contact_building_role:
        | "eigentuemer"
        | "mieter"
        | "verwalter"
        | "beirat"
        | "dienstleister"
      contact_type: "person" | "company" | "owner_group" | "service_provider"
      contact_usage_type:
        | "selbstbewohnt"
        | "zweitwohnsitz"
        | "vermietet"
        | "fewo"
        | "leerstand"
      cost_interval: "monatlich" | "quartal" | "jaehrlich"
      file_source: "manual" | "email" | "invoice" | "booking" | "meeting"
      file_visibility_role:
        | "intern"
        | "alle"
        | "eigentuemer"
        | "mieter"
        | "personen"
      invoice_type:
        | "standard"
        | "installment"
        | "annual_settlement"
        | "credit_note"
      key_loan_status: "open" | "returned" | "lost"
      management_mode: "weg" | "rent"
      rgi_client_type: "contact" | "building" | "free"
      rgi_invoice_item_kind: "time" | "flat" | "material" | "text"
      rgi_invoice_status:
        | "draft"
        | "sent"
        | "partial"
        | "paid"
        | "overdue"
        | "cancelled"
      rgi_project_status: "active" | "paused" | "closed"
      rgi_sparte: "weg" | "rent" | "sales" | "letting" | "other"
      service_order_status_enum:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "document_ready"
      service_type_enum: "nebenkosten" | "anlage_v" | "mietvertrag"
      unit_kind:
        | "apartment"
        | "parking_garage"
        | "parking_outdoor"
        | "cellar"
        | "hobby_room"
        | "garden"
        | "other"
        | "commercial"
      utility_type: "gas" | "strom" | "wasser" | "fernwaerme"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      annual_cycle_status: ["open", "in_progress", "done"],
      app_role: ["admin", "weg_owner", "tenant", "employee"],
      billing_mode: ["own_billing", "distribution_only"],
      case_category: [
        "schaden",
        "versicherung",
        "maengel",
        "eigentuemerwechsel",
        "rechtliches",
        "instandhaltung",
        "sonstiges",
      ],
      case_event_type: [
        "note",
        "email",
        "document",
        "image",
        "todo",
        "booking",
        "meeting",
        "phone",
        "status_change",
        "ai_summary",
        "file",
      ],
      case_participant_role: [
        "geschaedigter",
        "verursacher",
        "gutachter",
        "versicherer",
        "handwerker",
        "eigentuemer",
        "mieter",
        "behoerde",
        "sonstiges",
      ],
      case_priority: ["low", "medium", "high", "urgent"],
      case_status: [
        "open",
        "in_progress",
        "waiting_external",
        "waiting_owner",
        "resolved",
        "archived",
      ],
      contact_building_role: [
        "eigentuemer",
        "mieter",
        "verwalter",
        "beirat",
        "dienstleister",
      ],
      contact_type: ["person", "company", "owner_group", "service_provider"],
      contact_usage_type: [
        "selbstbewohnt",
        "zweitwohnsitz",
        "vermietet",
        "fewo",
        "leerstand",
      ],
      cost_interval: ["monatlich", "quartal", "jaehrlich"],
      file_source: ["manual", "email", "invoice", "booking", "meeting"],
      file_visibility_role: [
        "intern",
        "alle",
        "eigentuemer",
        "mieter",
        "personen",
      ],
      invoice_type: [
        "standard",
        "installment",
        "annual_settlement",
        "credit_note",
      ],
      key_loan_status: ["open", "returned", "lost"],
      management_mode: ["weg", "rent"],
      rgi_client_type: ["contact", "building", "free"],
      rgi_invoice_item_kind: ["time", "flat", "material", "text"],
      rgi_invoice_status: [
        "draft",
        "sent",
        "partial",
        "paid",
        "overdue",
        "cancelled",
      ],
      rgi_project_status: ["active", "paused", "closed"],
      rgi_sparte: ["weg", "rent", "sales", "letting", "other"],
      service_order_status_enum: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "document_ready",
      ],
      service_type_enum: ["nebenkosten", "anlage_v", "mietvertrag"],
      unit_kind: [
        "apartment",
        "parking_garage",
        "parking_outdoor",
        "cellar",
        "hobby_room",
        "garden",
        "other",
        "commercial",
      ],
      utility_type: ["gas", "strom", "wasser", "fernwaerme"],
    },
  },
} as const
