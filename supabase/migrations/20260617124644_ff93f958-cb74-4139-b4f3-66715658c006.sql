ALTER TABLE public.service_owner_costs
ADD COLUMN IF NOT EXISTS prorata_exempt boolean NOT NULL DEFAULT false;