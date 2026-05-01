ALTER TABLE public.etv_resolution_templates
  ADD COLUMN IF NOT EXISTS description text NULL,
  ADD COLUMN IF NOT EXISTS requires_resolution boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS double_qualified_relevant boolean NOT NULL DEFAULT false;

ALTER TABLE public.etv_resolution_templates
  ALTER COLUMN resolution_text DROP NOT NULL;