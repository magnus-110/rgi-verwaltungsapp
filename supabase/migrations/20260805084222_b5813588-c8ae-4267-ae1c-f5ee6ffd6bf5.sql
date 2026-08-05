ALTER TABLE public.building_files ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.building_file_categories ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_building_files_archived_at ON public.building_files (archived_at);
CREATE INDEX IF NOT EXISTS idx_building_file_categories_archived_at ON public.building_file_categories (archived_at);