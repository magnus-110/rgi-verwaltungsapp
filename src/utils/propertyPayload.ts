import { TablesInsert } from "@/integrations/supabase/types";
import { PropertyFormData } from "@/types/propertyForm";

type PropertyPayload = TablesInsert<"properties">;

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const normalized = String(value).replace(",", ".").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNullableDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const germanDateMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (germanDateMatch) {
    const [, day, month, year] = germanDateMatch;
    return `${year}-${month}-${day}`;
  }

  return null;
};

const normalizeAvailabilityStatus = (value: unknown): string => {
  if (typeof value !== "string") return "available";

  const normalized = value.trim().toLowerCase();
  if (!normalized) return "available";
  if (normalized === "verfügbar" || normalized === "verfuegbar") return "available";

  return normalized;
};

export const buildPropertyPayload = (
  data: PropertyFormData,
  updatedAt?: string,
): PropertyPayload => {
  const payload: PropertyPayload = {
    transaction_type: data.transaction_type || "sale",
    title: data.title?.trim() || "",
    description: toNullableString(data.description),
    property_type: data.property_type || "Wohnung",
    street: toNullableString(data.street),
    house_number: toNullableString(data.house_number),
    postal_code: toNullableString(data.postal_code),
    city: toNullableString(data.city),
    district: toNullableString(data.district),
    purchase_price: toNullableNumber(data.purchase_price),
    provision: toNullableNumber(data.provision),
    cold_rent: toNullableNumber(data.cold_rent),
    warm_rent: toNullableNumber(data.warm_rent),
    living_space: toNullableNumber(data.living_space),
    plot_size: toNullableNumber(data.plot_size),
    rooms: toNullableNumber(data.rooms),
    floor_number: toNullableNumber(data.floor_number),
    total_floors: toNullableNumber(data.total_floors),
    year_built: toNullableNumber(data.year_built),
    has_balcony: Boolean(data.has_balcony),
    has_terrace: Boolean(data.has_terrace),
    has_garden: Boolean(data.has_garden),
    has_cellar: Boolean(data.has_cellar),
    has_parking: Boolean(data.has_parking),
    has_elevator: Boolean(data.has_elevator),
    has_guest_toilet: Boolean(data.has_guest_toilet),
    has_fitted_kitchen: Boolean(data.has_fitted_kitchen),
    is_barrier_free: Boolean(data.is_barrier_free),
    availability_status: normalizeAvailabilityStatus(data.availability_status),
    is_active: data.is_active ?? true,
    energy_certificate_type: toNullableString(data.energy_certificate_type),
    energy_value: toNullableNumber(data.energy_value),
    energy_efficiency_class: toNullableString(data.energy_efficiency_class),
    energy_source: toNullableString(data.energy_source),
    heating_type: toNullableString(data.heating_type),
  };

  (payload as Record<string, unknown>).property_subtype = toNullableString(data.property_subtype);
  (payload as Record<string, unknown>).property_condition = toNullableString(data.property_condition);
  (payload as Record<string, unknown>).energy_certificate_creation_date = toNullableDate(data.energy_certificate_creation_date);

  if (updatedAt) {
    payload.updated_at = updatedAt;
  }

  return payload;
};
