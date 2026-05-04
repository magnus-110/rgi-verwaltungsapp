ALTER TABLE public.bank_statements
  ADD COLUMN IF NOT EXISTS source_format text NOT NULL DEFAULT 'camt_xml',
  ADD COLUMN IF NOT EXISTS parse_warnings jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema='public' AND table_name='bank_statements' AND constraint_name='bank_statements_source_format_check'
  ) THEN
    ALTER TABLE public.bank_statements
      ADD CONSTRAINT bank_statements_source_format_check
      CHECK (source_format IN ('camt_xml','pdf'));
  END IF;
END$$;

ALTER TABLE public.bank_reconciliations
  ADD COLUMN IF NOT EXISTS bank_source text,
  ADD COLUMN IF NOT EXISTS source_statement_id uuid REFERENCES public.bank_statements(id) ON DELETE SET NULL;
