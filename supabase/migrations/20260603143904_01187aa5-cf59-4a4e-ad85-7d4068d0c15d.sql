ALTER TABLE public.bank_statements ADD COLUMN fiscal_year integer;

UPDATE public.bank_statements SET fiscal_year = 2025 WHERE fiscal_year IS NULL;

ALTER TABLE public.bank_statements ALTER COLUMN fiscal_year SET NOT NULL;
ALTER TABLE public.bank_statements ALTER COLUMN fiscal_year SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int;

CREATE INDEX IF NOT EXISTS idx_bank_statements_building_fiscal_year ON public.bank_statements (building_id, fiscal_year);