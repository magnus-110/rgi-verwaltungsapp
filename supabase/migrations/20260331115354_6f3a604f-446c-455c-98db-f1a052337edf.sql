
ALTER TABLE public.contact_phones ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.contact_emails ADD COLUMN IF NOT EXISTS note TEXT;
