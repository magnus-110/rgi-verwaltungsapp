
DO $$ BEGIN
  CREATE TYPE public.service_type_enum AS ENUM ('nebenkosten','anlage_v','mietvertrag');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_order_status_enum AS ENUM ('pending','paid','failed','refunded','document_ready');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.service_pricing (
  service_type public.service_type_enum PRIMARY KEY,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  currency text NOT NULL DEFAULT 'eur',
  tax_behavior text NOT NULL DEFAULT 'inclusive',
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_pricing TO authenticated;
GRANT ALL ON public.service_pricing TO service_role;
ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_read_authenticated" ON public.service_pricing
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.service_pricing (service_type, price_cents) VALUES
  ('nebenkosten', 3500),
  ('anlage_v',    2900),
  ('mietvertrag', 3900)
ON CONFLICT (service_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.service_tenancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.contact_building_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_name text,
  tenant_address text,
  persons integer,
  move_in date,
  move_out date,
  nk_prepayment_monthly numeric(10,2),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_tenancies_assignment ON public.service_tenancies(assignment_id);
CREATE INDEX IF NOT EXISTS idx_service_tenancies_user ON public.service_tenancies(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_tenancies TO authenticated;
GRANT ALL ON public.service_tenancies TO service_role;
ALTER TABLE public.service_tenancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenancies_owner_select" ON public.service_tenancies
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.rgi_is_admin(auth.uid()));
CREATE POLICY "tenancies_owner_insert" ON public.service_tenancies
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenancies_owner_update" ON public.service_tenancies
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "tenancies_owner_delete" ON public.service_tenancies
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.service_owner_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.contact_building_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  fiscal_year integer NOT NULL,
  cost_type text NOT NULL,
  label text,
  amount numeric(12,2) NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owner_costs_assignment_year ON public.service_owner_costs(assignment_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_owner_costs_user ON public.service_owner_costs(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_owner_costs TO authenticated;
GRANT ALL ON public.service_owner_costs TO service_role;
ALTER TABLE public.service_owner_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_costs_select" ON public.service_owner_costs
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.rgi_is_admin(auth.uid()));
CREATE POLICY "owner_costs_insert" ON public.service_owner_costs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner_costs_update" ON public.service_owner_costs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner_costs_delete" ON public.service_owner_costs
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  service_type public.service_type_enum NOT NULL,
  assignment_id uuid REFERENCES public.contact_building_assignments(id) ON DELETE SET NULL,
  fiscal_year integer,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  status public.service_order_status_enum NOT NULL DEFAULT 'pending',
  agb_version text NOT NULL,
  privacy_version text NOT NULL,
  widerruf_waiver_confirmed boolean NOT NULL DEFAULT false,
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  stripe_invoice_pdf_url text,
  stripe_invoice_hosted_url text,
  document_storage_path text,
  document_error text,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  paid_at timestamptz,
  document_ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_orders_user ON public.service_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_orders_stripe_session ON public.service_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status ON public.service_orders(status);
GRANT SELECT, INSERT ON public.service_orders TO authenticated;
GRANT ALL ON public.service_orders TO service_role;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select_own" ON public.service_orders
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.rgi_is_admin(auth.uid()));
CREATE POLICY "orders_insert_own" ON public.service_orders
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('agb','datenschutz')),
  document_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_doc ON public.legal_acceptances(user_id, document_type, document_version);
GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legal_select_own" ON public.legal_acceptances
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.rgi_is_admin(auth.uid()));
CREATE POLICY "legal_insert_own" ON public.legal_acceptances
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DO $$ BEGIN
  CREATE TRIGGER trg_service_tenancies_updated_at BEFORE UPDATE ON public.service_tenancies
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_service_owner_costs_updated_at BEFORE UPDATE ON public.service_owner_costs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_service_orders_updated_at BEFORE UPDATE ON public.service_orders
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
ALTER TABLE public.service_orders REPLICA IDENTITY FULL;
