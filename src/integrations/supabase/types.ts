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
      buildings: {
        Row: {
          address: string
          building_code: string
          created_at: string | null
          id: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          manager_name: string | null
          name: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          building_code: string
          created_at?: string | null
          id?: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          manager_name?: string | null
          name: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          building_code?: string
          created_at?: string | null
          id?: string
          management_mode?: Database["public"]["Enums"]["management_mode"]
          manager_name?: string | null
          name?: string
          type?: string | null
          updated_at?: string | null
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
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          building_id?: string | null
          category: string
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          building_id?: string | null
          category?: string
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
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
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "building_documents"
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
      miete_reports: {
        Row: {
          admin_notes: string | null
          attachments: Json | null
          building_id: string | null
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
        Relationships: []
      }
      profiles: {
        Row: {
          building_id: string | null
          created_at: string | null
          email: string
          first_name: string | null
          force_password_change: boolean | null
          id: string
          last_name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          building_id?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          force_password_change?: boolean | null
          id?: string
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          building_id?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          force_password_change?: boolean | null
          id?: string
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
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
      report_templates: {
        Row: {
          content: string | null
          created_at: string
          id: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          name: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          management_mode: Database["public"]["Enums"]["management_mode"]
          name: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          management_mode?: Database["public"]["Enums"]["management_mode"]
          name?: string
          updated_at?: string
        }
        Relationships: []
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
          category_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          is_recurring: boolean | null
          parent_todo_id: string | null
          priority: string
          recurrence_end_date: string | null
          recurrence_interval: number | null
          recurrence_pattern: string | null
          status: string
          task_number: number
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json | null
          building_id?: string | null
          category_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean | null
          parent_todo_id?: string | null
          priority?: string
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_pattern?: string | null
          status?: string
          task_number?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json | null
          building_id?: string | null
          category_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean | null
          parent_todo_id?: string | null
          priority?: string
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_pattern?: string | null
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_building_manager: {
        Args: { building_id_param: string; user_id_param: string }
        Returns: undefined
      }
      count_building_managers: {
        Args: { building_id_param: string }
        Returns: number
      }
      generate_building_code: {
        Args: {
          management_mode_param: Database["public"]["Enums"]["management_mode"]
        }
        Returns: string
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
      get_user_role: {
        Args: { user_uuid: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      remove_building_manager: {
        Args: { manager_id_param: string }
        Returns: undefined
      }
      remove_push_subscription: {
        Args: { endpoint_param: string; user_id_param: string }
        Returns: undefined
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
      user_has_admin_access: { Args: { user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "weg_owner" | "tenant" | "employee"
      management_mode: "weg" | "rent"
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
      app_role: ["admin", "weg_owner", "tenant", "employee"],
      management_mode: ["weg", "rent"],
    },
  },
} as const
