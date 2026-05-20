ALTER TABLE public.building_files ADD COLUMN IF NOT EXISTS fiscal_year integer;
CREATE INDEX IF NOT EXISTS idx_building_files_fiscal_year ON public.building_files (building_id, fiscal_year);