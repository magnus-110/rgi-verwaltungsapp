-- Tabelle für geplante Einzelmails (Postfach-Compose mit Sendezeit)
CREATE TABLE public.scheduled_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  to_addresses text[] NOT NULL,
  cc_addresses text[] NULL,
  bcc_addresses text[] NULL,
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{filename, content (base64), contentType, size}]
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled | sending | sent | failed | cancelled
  error_message text NULL,
  sent_at timestamptz NULL,
  reply_to_message_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_emails_due ON public.scheduled_emails(status, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_scheduled_emails_user ON public.scheduled_emails(user_id, scheduled_at DESC);

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Nur Admin/Mitarbeiter sehen/ändern
CREATE POLICY "Admins manage scheduled emails"
ON public.scheduled_emails
FOR ALL
TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

-- Updated-At Trigger
CREATE TRIGGER trg_scheduled_emails_updated_at
BEFORE UPDATE ON public.scheduled_emails
FOR EACH ROW EXECUTE FUNCTION public.update_todos_updated_at();
