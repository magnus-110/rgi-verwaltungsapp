ALTER TABLE public.etv_agenda_items
ADD COLUMN IF NOT EXISTS include_description_in_invitation boolean NOT NULL DEFAULT false;