ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS etv_agenda_item_id uuid NULL
    REFERENCES public.etv_agenda_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_emails_etv_agenda_item_id
  ON public.emails(etv_agenda_item_id)
  WHERE etv_agenda_item_id IS NOT NULL;