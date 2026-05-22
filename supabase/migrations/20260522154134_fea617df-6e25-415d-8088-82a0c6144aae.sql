
CREATE TABLE public.email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid,
  to_addresses text[] NOT NULL DEFAULT '{}',
  cc_addresses text[],
  bcc_addresses text[],
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to_email_id uuid,
  forward_email_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own drafts" ON public.email_drafts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own drafts" ON public.email_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own drafts" ON public.email_drafts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own drafts" ON public.email_drafts
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_email_drafts_user_updated ON public.email_drafts (user_id, updated_at DESC);

CREATE TRIGGER set_email_drafts_updated_at
  BEFORE UPDATE ON public.email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
