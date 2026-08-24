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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      properties: {
        Row: {
          availability_status: string | null
          city: string | null
          cold_rent: number | null
          created_at: string
          description: string | null
          district: string | null
          energy_certificate_creation_date: string | null
          energy_certificate_type: string | null
          energy_efficiency_class: string | null
          energy_source: string | null
          energy_value: number | null
          floor_number: number | null
          has_balcony: boolean | null
          has_cellar: boolean | null
          has_elevator: boolean | null
          has_fitted_kitchen: boolean | null
          has_garden: boolean | null
          has_guest_toilet: boolean | null
          has_parking: boolean | null
          has_terrace: boolean | null
          heating_type: string | null
          house_number: string | null
          id: string
          is_active: boolean | null
          is_barrier_free: boolean | null
          living_space: number | null
          plot_size: number | null
          postal_code: string | null
          property_condition: string | null
          property_subtype: string | null
          property_type: string
          provision: number | null
          purchase_price: number | null
          reference_sort_order: number | null
          rooms: number | null
          street: string | null
          title: string
          total_floors: number | null
          transaction_type: string
          updated_at: string
          warm_rent: number | null
          year_built: number | null
        }
        Insert: {
          availability_status?: string | null
          city?: string | null
          cold_rent?: number | null
          created_at?: string
          description?: string | null
          district?: string | null
          energy_certificate_creation_date?: string | null
          energy_certificate_type?: string | null
          energy_efficiency_class?: string | null
          energy_source?: string | null
          energy_value?: number | null
          floor_number?: number | null
          has_balcony?: boolean | null
          has_cellar?: boolean | null
          has_elevator?: boolean | null
          has_fitted_kitchen?: boolean | null
          has_garden?: boolean | null
          has_guest_toilet?: boolean | null
          has_parking?: boolean | null
          has_terrace?: boolean | null
          heating_type?: string | null
          house_number?: string | null
          id?: string
          is_active?: boolean | null
          is_barrier_free?: boolean | null
          living_space?: number | null
          plot_size?: number | null
          postal_code?: string | null
          property_condition?: string | null
          property_subtype?: string | null
          property_type?: string
          provision?: number | null
          purchase_price?: number | null
          reference_sort_order?: number | null
          rooms?: number | null
          street?: string | null
          title?: string
          total_floors?: number | null
          transaction_type?: string
          updated_at?: string
          warm_rent?: number | null
          year_built?: number | null
        }
        Update: {
          availability_status?: string | null
          city?: string | null
          cold_rent?: number | null
          created_at?: string
          description?: string | null
          district?: string | null
          energy_certificate_creation_date?: string | null
          energy_certificate_type?: string | null
          energy_efficiency_class?: string | null
          energy_source?: string | null
          energy_value?: number | null
          floor_number?: number | null
          has_balcony?: boolean | null
          has_cellar?: boolean | null
          has_elevator?: boolean | null
          has_fitted_kitchen?: boolean | null
          has_garden?: boolean | null
          has_guest_toilet?: boolean | null
          has_parking?: boolean | null
          has_terrace?: boolean | null
          heating_type?: string | null
          house_number?: string | null
          id?: string
          is_active?: boolean | null
          is_barrier_free?: boolean | null
          living_space?: number | null
          plot_size?: number | null
          postal_code?: string | null
          property_condition?: string | null
          property_subtype?: string | null
          property_type?: string
          provision?: number | null
          purchase_price?: number | null
          reference_sort_order?: number | null
          rooms?: number | null
          street?: string | null
          title?: string
          total_floors?: number | null
          transaction_type?: string
          updated_at?: string
          warm_rent?: number | null
          year_built?: number | null
        }
        Relationships: []
      }
      property_documents: {
        Row: {
          created_at: string
          document_name: string | null
          document_type: string | null
          document_url: string
          file_size: number | null
          id: string
          property_id: string
        }
        Insert: {
          created_at?: string
          document_name?: string | null
          document_type?: string | null
          document_url: string
          file_size?: number | null
          id?: string
          property_id: string
        }
        Update: {
          created_at?: string
          document_name?: string | null
          document_type?: string | null
          document_url?: string
          file_size?: number | null
          id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_images: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          image_url: string
          property_id: string
          sort_order: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          property_id: string
          sort_order?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          property_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_images_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
