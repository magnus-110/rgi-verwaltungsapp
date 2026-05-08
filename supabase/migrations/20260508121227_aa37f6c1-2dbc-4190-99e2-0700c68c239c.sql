-- Separate Tabelle für In-App E-Mail-Abos (unabhängig von Push)
CREATE TABLE IF NOT EXISTS public.in_app_email_subscriptions (
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id)
);

ALTER TABLE public.in_app_email_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view their own in-app email subs"
ON public.in_app_email_subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users can insert their own in-app email subs"
ON public.in_app_email_subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can delete their own in-app email subs"
ON public.in_app_email_subscriptions FOR DELETE
USING (auth.uid() = user_id);

ALTER TABLE public.in_app_email_subscriptions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_email_subscriptions;