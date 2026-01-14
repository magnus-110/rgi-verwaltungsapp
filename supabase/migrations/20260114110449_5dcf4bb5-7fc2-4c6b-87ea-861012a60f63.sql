-- Add columns for signed URL handling and retry logic
ALTER TABLE public.building_documents 
ADD COLUMN IF NOT EXISTS signed_url TEXT,
ADD COLUMN IF NOT EXISTS signed_url_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Add index for finding documents that need retry
CREATE INDEX IF NOT EXISTS idx_building_documents_retry 
ON public.building_documents(status, retry_count) 
WHERE status = 'error' AND retry_count < 3;

-- Comment for documentation
COMMENT ON COLUMN public.building_documents.signed_url IS 'Signed URL for batch processing - allows Mistral to access the file directly';
COMMENT ON COLUMN public.building_documents.signed_url_expires_at IS 'Expiration time of the signed URL';
COMMENT ON COLUMN public.building_documents.retry_count IS 'Number of processing retry attempts';
COMMENT ON COLUMN public.building_documents.last_error IS 'Last error message for debugging';