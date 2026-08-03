ALTER TABLE public.comm_recipient_overrides
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.contact_building_assignments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS attachment_paths text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.comm_recipient_overrides ALTER COLUMN contact_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_recipient_overrides_campaign
  ON public.comm_recipient_overrides (campaign_id);
CREATE INDEX IF NOT EXISTS idx_comm_recipient_overrides_assignment
  ON public.comm_recipient_overrides (assignment_id);