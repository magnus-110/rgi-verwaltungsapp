-- Add 'dienstleister' to contact_building_role enum
ALTER TYPE public.contact_building_role ADD VALUE IF NOT EXISTS 'dienstleister';

-- Add service_category column for service provider categorization
ALTER TABLE public.contact_building_assignments
  ADD COLUMN IF NOT EXISTS service_category text;

-- Index for filtering providers efficiently per building
CREATE INDEX IF NOT EXISTS idx_cba_role_building
  ON public.contact_building_assignments(building_id, role_in_building);