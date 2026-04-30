ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS is_etv_relevant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS etv_meeting_id uuid NULL REFERENCES public.etv_meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_emails_etv_relevant
  ON public.emails(building_id, etv_meeting_id)
  WHERE is_etv_relevant = true;