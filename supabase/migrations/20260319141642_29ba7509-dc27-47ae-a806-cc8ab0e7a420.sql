
ALTER TABLE public.bookings
  ADD COLUMN counter_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL DEFAULT NULL,
  ADD COLUMN receipt_number text DEFAULT NULL,
  ADD COLUMN booking_reference text DEFAULT NULL,
  ADD COLUMN vat_rate numeric DEFAULT 0,
  ADD COLUMN vat_amount numeric DEFAULT NULL,
  ADD COLUMN is_35a_relevant boolean DEFAULT false,
  ADD COLUMN booking_type text DEFAULT 'expense';
