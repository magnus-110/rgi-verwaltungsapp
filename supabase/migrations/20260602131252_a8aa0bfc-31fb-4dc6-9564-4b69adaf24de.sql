ALTER TABLE public.document_chunks DROP CONSTRAINT IF EXISTS document_chunks_category_check;
ALTER TABLE public.document_chunks ADD CONSTRAINT document_chunks_category_check
  CHECK (category = ANY (ARRAY['building'::text, 'general'::text, 'building_file'::text]));