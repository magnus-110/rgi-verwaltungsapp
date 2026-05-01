ALTER TABLE public.etv_agenda_items
  ADD COLUMN IF NOT EXISTS requires_resolution boolean NOT NULL DEFAULT true;