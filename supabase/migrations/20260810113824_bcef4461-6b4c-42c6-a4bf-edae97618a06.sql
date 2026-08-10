ALTER TABLE public.comm_recipient_overrides DROP CONSTRAINT IF EXISTS comm_recipient_overrides_campaign_id_contact_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS comm_recipient_overrides_unique_row
  ON public.comm_recipient_overrides (campaign_id, contact_id, COALESCE(assignment_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(lower(email), ''));