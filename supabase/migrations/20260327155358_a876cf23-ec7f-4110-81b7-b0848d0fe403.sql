
-- 1. Add booking_instructions to buildings
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS booking_instructions text;

-- 2. Create utility_type enum
DO $$ BEGIN
  CREATE TYPE public.utility_type AS ENUM ('gas', 'strom', 'wasser', 'fernwaerme');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create invoice_type enum
DO $$ BEGIN
  CREATE TYPE public.invoice_type AS ENUM ('standard', 'installment', 'annual_settlement');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Create utility_contracts table
CREATE TABLE IF NOT EXISTS public.utility_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  vendor_name text NOT NULL,
  vendor_iban text,
  utility_type public.utility_type NOT NULL,
  contract_number text,
  meter_number text,
  installment_amount numeric,
  installment_interval text DEFAULT 'monatlich',
  prepayment_account_id uuid REFERENCES public.chart_of_accounts(id),
  expense_account_id uuid REFERENCES public.chart_of_accounts(id),
  period_from date,
  period_to date,
  status text DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.utility_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage utility_contracts"
  ON public.utility_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Extend invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_type public.invoice_type DEFAULT 'standard';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS utility_contract_id uuid REFERENCES public.utility_contracts(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS installment_period text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS meter_number text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billing_period_from date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billing_period_to date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total_consumption numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_installments_total numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS settlement_difference numeric;
