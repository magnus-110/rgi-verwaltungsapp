ALTER TABLE public.contact_building_assignments
  ADD COLUMN IF NOT EXISTS is_emergency_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emergency_note text,
  ADD COLUMN IF NOT EXISTS emergency_sort_order integer;

CREATE INDEX IF NOT EXISTS idx_cba_emergency
  ON public.contact_building_assignments (building_id)
  WHERE is_emergency_contact = true;