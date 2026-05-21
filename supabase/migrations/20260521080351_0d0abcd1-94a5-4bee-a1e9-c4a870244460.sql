
-- Erweiterte Felder für Firmen/Dienstleister-Kontakte
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS trade_notes text,
  ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS last_hired_at date,
  ADD COLUMN IF NOT EXISTS is_emergency_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_lat double precision,
  ADD COLUMN IF NOT EXISTS address_lon double precision;

-- Index für schnellen Kategorie-Filter (Array-Overlap)
CREATE INDEX IF NOT EXISTS idx_contacts_service_provider_categories
  ON public.contacts USING GIN (service_provider_categories);

-- Index für Ort-Filter (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_contacts_address_city_lower
  ON public.contacts (lower(address_city));

-- Index für PLZ-Prefix-Filter
CREATE INDEX IF NOT EXISTS idx_contacts_address_zip
  ON public.contacts (address_zip);

-- Index für Bewertungs-Sortierung
CREATE INDEX IF NOT EXISTS idx_contacts_rating
  ON public.contacts (rating DESC NULLS LAST);
