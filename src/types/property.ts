
export interface Property {
  id: string;
  title: string;
  description: string | null;
  transaction_type: string;
  property_type: string;
  /** Genauere Objektart fuer die Schaufensteranzeige (optional) */
  property_subtype: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  district: string | null;
  living_space: number | null;
  plot_size: number | null;
  rooms: number | null;
  floor_number: number | null;
  total_floors: number | null;
  year_built: number | null;
  has_balcony: boolean | null;
  has_terrace: boolean | null;
  has_garden: boolean | null;
  has_cellar: boolean | null;
  has_parking: boolean | null;
  has_elevator: boolean | null;
  has_guest_toilet: boolean | null;
  has_fitted_kitchen: boolean | null;
  is_barrier_free: boolean | null;
  purchase_price: number | null;
  cold_rent: number | null;
  warm_rent: number | null;
  energy_value: number | null;
  energy_efficiency_class: string | null;
  energy_certificate_type: string | null;
  heating_type: string | null;
  energy_source: string | null;
  property_condition: string | null;
  energy_certificate_creation_date: string | null;
  availability_status: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyImage {
  id: string;
  property_id: string;
  image_url: string;
  caption: string | null;
  sort_order: number | null;
  created_at: string;
}

export interface PropertyDocument {
  id: string;
  property_id: string;
  document_name: string | null;
  document_type: string | null;
  document_url: string;
  file_size: number | null;
  created_at: string;
}

export interface PropertyWithImages extends Property {
  property_images: PropertyImage[];
}

export interface PropertyFilters {
  transaction_type?: string;
  property_type?: string;
  min_price?: number;
  max_price?: number;
  min_rooms?: number;
  city?: string;
  availability_status?: string | string[];
  is_active?: boolean;
}

export interface AdminUser {
  id: string;
  username: string;
  password_hash: string;
  created_at: string | null;
  updated_at: string | null;
}
