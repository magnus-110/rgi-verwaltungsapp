
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS to_names TEXT[];
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS cc_addresses TEXT[];
