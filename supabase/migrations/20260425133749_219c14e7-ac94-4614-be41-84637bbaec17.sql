CREATE TABLE IF NOT EXISTS public.service_provider_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  contact_phone text,
  contact_email text,
  website text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.service_provider_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pool readable by authenticated"
  ON public.service_provider_pool FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pool insert admin/employee"
  ON public.service_provider_pool FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Pool update admin/employee"
  ON public.service_provider_pool FOR UPDATE
  TO authenticated
  USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Pool delete admin/employee"
  ON public.service_provider_pool FOR DELETE
  TO authenticated
  USING (public.user_has_admin_access(auth.uid()));

CREATE TRIGGER service_provider_pool_updated_at
  BEFORE UPDATE ON public.service_provider_pool
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_service_provider_pool_category
  ON public.service_provider_pool(category) WHERE is_active = true;

ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS welcome_letter_template_id uuid REFERENCES public.comm_templates(id) ON DELETE SET NULL;