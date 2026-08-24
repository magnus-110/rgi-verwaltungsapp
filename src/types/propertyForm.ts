
export interface PropertyFormData {
  transaction_type: string;
  title: string;
  description: string;
  property_type: string;
  /** Genauere Objektart fuer die Schaufensteranzeige, z. B.
   *  "Einfamilienhaus", "Penthouse", "Hotel". Leer lassen, dann
   *  wird die Bezeichnung aus Immobilienart und Zimmerzahl gebildet. */
  property_subtype: string | null;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  district: string;
  purchase_price: number | null;
  provision: number | null;
  cold_rent: number | null;
  warm_rent: number | null;
  living_space: number | null;
  plot_size: number | null;
  rooms: number | null;
  floor_number: number | null;
  total_floors: number | null;
  year_built: number | null;
  has_balcony: boolean;
  has_terrace: boolean;
  has_garden: boolean;
  has_cellar: boolean;
  has_parking: boolean;
  has_elevator: boolean;
  has_guest_toilet: boolean;
  has_fitted_kitchen: boolean;
  is_barrier_free: boolean;
  availability_status: string;
  is_active: boolean;
  // Energieausweis-Felder
  energy_certificate_type: string | null;
  energy_value: number | null;
  energy_efficiency_class: string | null;
  energy_source: string | null;
  heating_type: string | null;
  property_condition: string | null;
  energy_certificate_creation_date: string | null;
}

export const initialFormData: PropertyFormData = {
  transaction_type: 'sale',
  title: '',
  description: '',
  property_type: 'Wohnung',
  property_subtype: null,
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
  district: '',
  purchase_price: null,
  provision: null,
  cold_rent: null,
  warm_rent: null,
  living_space: null,
  plot_size: null,
  rooms: null,
  floor_number: null,
  total_floors: null,
  year_built: null,
  has_balcony: false,
  has_terrace: false,
  has_garden: false,
  has_cellar: false,
  has_parking: false,
  has_elevator: false,
  has_guest_toilet: false,
  has_fitted_kitchen: false,
  is_barrier_free: false,
  availability_status: 'available',
  is_active: true,
  // Energieausweis-Felder
  energy_certificate_type: null,
  energy_value: null,
  energy_efficiency_class: null,
  energy_source: null,
  heating_type: null,
  property_condition: null,
  energy_certificate_creation_date: null
};
