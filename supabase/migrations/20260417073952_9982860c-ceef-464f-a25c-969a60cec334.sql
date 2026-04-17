ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS ai_analysis_status TEXT,
  ADD COLUMN IF NOT EXISTS ai_analysis_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_analysis_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_ai_status
  ON public.bank_transactions(ai_analysis_status)
  WHERE ai_analysis_status IS NOT NULL;