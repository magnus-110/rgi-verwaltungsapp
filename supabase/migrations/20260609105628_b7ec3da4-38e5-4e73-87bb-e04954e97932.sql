ALTER TABLE public.etv_agenda_items
  ADD COLUMN IF NOT EXISTS is_actionable boolean NOT NULL DEFAULT false;

ALTER TABLE public.etv_resolution_templates
  ADD COLUMN IF NOT EXISTS is_actionable boolean NOT NULL DEFAULT false;