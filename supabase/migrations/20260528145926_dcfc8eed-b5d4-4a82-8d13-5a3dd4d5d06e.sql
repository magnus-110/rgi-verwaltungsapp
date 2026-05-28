CREATE TABLE public.comm_recipient_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.comm_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  subject TEXT,
  body_html TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comm_recipient_overrides TO authenticated;
GRANT ALL ON public.comm_recipient_overrides TO service_role;

ALTER TABLE public.comm_recipient_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage recipient overrides"
  ON public.comm_recipient_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_comm_recipient_overrides_campaign
  ON public.comm_recipient_overrides(campaign_id);

CREATE TRIGGER trg_comm_recipient_overrides_updated_at
  BEFORE UPDATE ON public.comm_recipient_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();