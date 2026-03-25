
-- Junction table: assign employees/admins to email accounts
CREATE TABLE public.email_account_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, user_id)
);

ALTER TABLE public.email_account_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email account users"
  ON public.email_account_users
  FOR ALL
  TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));
