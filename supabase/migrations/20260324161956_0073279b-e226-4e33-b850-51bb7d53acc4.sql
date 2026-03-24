
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_message_id ON public.emails(message_id) WHERE message_id IS NOT NULL;
