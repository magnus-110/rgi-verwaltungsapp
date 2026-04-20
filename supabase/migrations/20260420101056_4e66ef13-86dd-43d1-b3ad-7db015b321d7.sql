-- 1. Add opening/closing balance to bank_statements (for CAMT auto-suggestion)
ALTER TABLE public.bank_statements
  ADD COLUMN IF NOT EXISTS opening_balance numeric,
  ADD COLUMN IF NOT EXISTS closing_balance numeric;

-- 2. Create bank_reconciliations table
CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  opening_balance_bank numeric,
  closing_balance_bank numeric,
  opening_balance_book numeric,
  closing_balance_book numeric,
  difference numeric,
  status text NOT NULL DEFAULT 'open',
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, bank_account_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_bank_recon_building_year
  ON public.bank_reconciliations(building_id, period_year);
CREATE INDEX IF NOT EXISTS idx_bank_recon_account
  ON public.bank_reconciliations(bank_account_id);

-- 3. RLS
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and building managers can view reconciliations"
  ON public.bank_reconciliations FOR SELECT
  USING (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "Admins and building managers can insert reconciliations"
  ON public.bank_reconciliations FOR INSERT
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "Admins and building managers can update reconciliations"
  ON public.bank_reconciliations FOR UPDATE
  USING (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "Admins and building managers can delete reconciliations"
  ON public.bank_reconciliations FOR DELETE
  USING (public.user_can_access_building(auth.uid(), building_id));

-- 4. Trigger for updated_at
CREATE TRIGGER trg_bank_reconciliations_updated_at
  BEFORE UPDATE ON public.bank_reconciliations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Helper RPC: calculate cumulative bank account balance at a given date
CREATE OR REPLACE FUNCTION public.calculate_account_balance_at(
  p_account_id uuid,
  p_building_id uuid,
  p_date date
)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(SUM(
        CASE
          WHEN b.account_id = p_account_id THEN b.amount
          WHEN b.counter_account_id = p_account_id THEN -b.amount
          ELSE 0
        END
      ), 0)
      FROM public.bookings b
      WHERE b.building_id = p_building_id
        AND b.booking_date <= p_date
        AND (b.account_id = p_account_id OR b.counter_account_id = p_account_id)
    ),
    0
  );
$$;