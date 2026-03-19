
-- Bank Statements table
CREATE TABLE public.bank_statements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_path text,
  import_date timestamp with time zone NOT NULL DEFAULT now(),
  statement_date_from date,
  statement_date_to date,
  account_iban text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and employees can manage bank statements"
  ON public.bank_statements FOR ALL
  USING (user_has_admin_access(auth.uid()));

-- Bank Transactions table
CREATE TABLE public.bank_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  statement_id uuid NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  booking_date date NOT NULL,
  value_date date,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  debtor_name text,
  debtor_iban text,
  creditor_name text,
  creditor_iban text,
  purpose text,
  end_to_end_ref text,
  match_status text NOT NULL DEFAULT 'unmatched',
  matched_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  matched_template_id uuid,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and employees can manage bank transactions"
  ON public.bank_transactions FOR ALL
  USING (user_has_admin_access(auth.uid()));

-- Booking Templates table
CREATE TABLE public.booking_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  vendor_name text,
  vendor_iban text,
  expected_amount numeric,
  account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_35a_relevant boolean DEFAULT false,
  interval text DEFAULT 'monatlich',
  category text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and employees can manage booking templates"
  ON public.booking_templates FOR ALL
  USING (user_has_admin_access(auth.uid()));

-- Add FK from bank_transactions to booking_templates (after booking_templates exists)
ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_matched_template_id_fkey
  FOREIGN KEY (matched_template_id) REFERENCES public.booking_templates(id) ON DELETE SET NULL;
