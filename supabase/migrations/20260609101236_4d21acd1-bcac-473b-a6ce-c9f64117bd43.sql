ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fiscal_year_start_day smallint NOT NULL DEFAULT 1;

ALTER TABLE public.buildings
  DROP CONSTRAINT IF EXISTS buildings_fiscal_year_start_month_chk;
ALTER TABLE public.buildings
  ADD CONSTRAINT buildings_fiscal_year_start_month_chk
  CHECK (fiscal_year_start_month BETWEEN 1 AND 12);

ALTER TABLE public.buildings
  DROP CONSTRAINT IF EXISTS buildings_fiscal_year_start_day_chk;
ALTER TABLE public.buildings
  ADD CONSTRAINT buildings_fiscal_year_start_day_chk
  CHECK (fiscal_year_start_day BETWEEN 1 AND 28);