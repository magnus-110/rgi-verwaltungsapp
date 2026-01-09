-- Add batch processing fields to building_documents table
ALTER TABLE public.building_documents
ADD COLUMN IF NOT EXISTS total_pages integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS processed_pages integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS extracted_text text,
ADD COLUMN IF NOT EXISTS processing_batch integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_phase text DEFAULT 'pending';

-- Add comment for documentation
COMMENT ON COLUMN public.building_documents.total_pages IS 'Total number of pages in the document';
COMMENT ON COLUMN public.building_documents.processed_pages IS 'Number of pages already processed (for resumable processing)';
COMMENT ON COLUMN public.building_documents.extracted_text IS 'Accumulated extracted text (for resumable processing)';
COMMENT ON COLUMN public.building_documents.processing_batch IS 'Current batch index being processed';
COMMENT ON COLUMN public.building_documents.processing_phase IS 'Current processing phase: pending, ocr, chunking, embedding, ready, error';