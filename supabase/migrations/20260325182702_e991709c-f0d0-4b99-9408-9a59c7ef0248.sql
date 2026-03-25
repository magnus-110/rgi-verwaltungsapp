
-- 1. billing_periods: Abrechnungszeiträume
CREATE TABLE public.billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  heating_provider TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(building_id, fiscal_year)
);

ALTER TABLE public.billing_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage billing_periods" ON public.billing_periods
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

-- 2. fuel_inventory: Brennstoffbestandsführung
CREATE TABLE public.fuel_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  billing_period_id UUID REFERENCES public.billing_periods(id) ON DELETE SET NULL,
  fuel_type TEXT NOT NULL DEFAULT 'oil',
  entry_type TEXT NOT NULL DEFAULT 'purchase',
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'l',
  total_price NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC GENERATED ALWAYS AS (CASE WHEN quantity > 0 THEN total_price / quantity ELSE 0 END) STORED,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fuel_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage fuel_inventory" ON public.fuel_inventory
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

-- 3. account_balances: Saldenübernahme
CREATE TABLE public.account_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  closing_balance NUMERIC NOT NULL DEFAULT 0,
  is_carried_forward BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(building_id, account_id, fiscal_year)
);

ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage account_balances" ON public.account_balances
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

-- 4. billing_validations: Prüfprotokoll
CREATE TABLE public.billing_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id UUID NOT NULL REFERENCES public.billing_periods(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expected_value NUMERIC,
  actual_value NUMERIC,
  difference NUMERIC,
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_validations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage billing_validations" ON public.billing_validations
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

-- 5. Neue Spalten in chart_of_accounts
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_billing_relevant BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_heating_relevant BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carry_forward_balance BOOLEAN NOT NULL DEFAULT false;

-- 6. Neue Spalte in bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_category TEXT;

-- 7. Updated_at Trigger für neue Tabellen
CREATE TRIGGER update_billing_periods_updated_at
  BEFORE UPDATE ON public.billing_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_account_balances_updated_at
  BEFORE UPDATE ON public.account_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
