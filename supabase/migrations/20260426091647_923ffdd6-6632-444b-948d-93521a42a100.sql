ALTER TABLE public.contact_building_assignments
  ADD COLUMN IF NOT EXISTS is_cash_auditor boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cba_cash_auditor
  ON public.contact_building_assignments (building_id)
  WHERE is_cash_auditor = true;