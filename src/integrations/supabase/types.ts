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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
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
          priority: string
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
          priority?: string
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
          priority?: string
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
    }
    Enums: {
      app_role: "admin" | "weg_owner" | "tenant"
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
      app_role: ["admin", "weg_owner", "tenant"],
      management_mode: ["weg", "rent"],
    },
  },
} as const
