ALTER TABLE public.contact_building_assignments
  ADD COLUMN IF NOT EXISTS address_street_override text,
  ADD COLUMN IF NOT EXISTS address_zip_override text,
  ADD COLUMN IF NOT EXISTS address_city_override text,
  ADD COLUMN IF NOT EXISTS phones_override jsonb,
  ADD COLUMN IF NOT EXISTS emails_override jsonb,
  ADD COLUMN IF NOT EXISTS iban_override text,
  ADD COLUMN IF NOT EXISTS primary_contact_self boolean,
  ADD COLUMN IF NOT EXISTS primary_contact_other jsonb,
  ADD COLUMN IF NOT EXISTS expectations_override text;