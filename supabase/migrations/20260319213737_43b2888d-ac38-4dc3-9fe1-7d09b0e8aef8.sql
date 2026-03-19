
ALTER TABLE public.bank_transactions 
  ADD COLUMN IF NOT EXISTS transaction_hash text,
  ADD COLUMN IF NOT EXISTS booked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_hash 
  ON public.bank_transactions (transaction_hash) 
  WHERE transaction_hash IS NOT NULL;
