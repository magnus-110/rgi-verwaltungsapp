ALTER TABLE public.building_files
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE public.building_files
  DROP CONSTRAINT IF EXISTS building_files_processing_status_check;
ALTER TABLE public.building_files
  ADD CONSTRAINT building_files_processing_status_check
  CHECK (processing_status IN ('pending','processing','done','failed','skipped'));

-- Backfill: existing files with extracted text are done; others stay pending
UPDATE public.building_files
SET processing_status = 'done', processed_at = COALESCE(processed_at, updated_at, created_at)
WHERE extracted_text IS NOT NULL AND length(extracted_text) >= 30 AND processing_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_building_files_processing_status
  ON public.building_files(processing_status)
  WHERE deleted_at IS NULL;