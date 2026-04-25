DROP TABLE IF EXISTS public.service_provider_pool;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_service_provider_pool boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_provider_categories text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS idx_contacts_service_provider_pool
  ON public.contacts(is_service_provider_pool)
  WHERE is_service_provider_pool = true;