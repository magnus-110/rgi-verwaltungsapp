
-- Add short_code to email_accounts
ALTER TABLE public.email_accounts ADD COLUMN IF NOT EXISTS short_code varchar(5);

-- Add assigned_to to emails
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(user_id);
