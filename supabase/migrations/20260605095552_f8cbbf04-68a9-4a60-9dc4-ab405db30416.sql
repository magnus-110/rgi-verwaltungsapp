ALTER TABLE public.maintenance_configs
  ADD COLUMN IF NOT EXISTS custom_label TEXT,
  ADD COLUMN IF NOT EXISTS custom_category TEXT;