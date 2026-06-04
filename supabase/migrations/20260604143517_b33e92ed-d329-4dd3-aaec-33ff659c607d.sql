ALTER TABLE public.etv_agenda_items 
  ADD COLUMN IF NOT EXISTS total_mea_yes numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_mea_no numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_mea_abstain numeric NOT NULL DEFAULT 0;