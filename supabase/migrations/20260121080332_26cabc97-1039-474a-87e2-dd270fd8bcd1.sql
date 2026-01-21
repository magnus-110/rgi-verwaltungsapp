-- Mark stuck jobs as error
UPDATE reorganization_jobs 
SET 
  status = 'error',
  error_message = 'Job wurde abgebrochen - Timeout während der Verarbeitung',
  updated_at = NOW()
WHERE id IN ('1f063d8a-9b48-46c1-96a8-aceaac5ea371', '05c8b943-a64c-47e7-8f06-d975619f79ec');

-- Add new columns to building_documents for tracking indexing status
ALTER TABLE building_documents 
ADD COLUMN IF NOT EXISTS indexing_status TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS indexed_pages INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS indexing_started_at TIMESTAMPTZ DEFAULT NULL;

-- Add new columns to reorganization_jobs for better tracking
ALTER TABLE reorganization_jobs
ADD COLUMN IF NOT EXISTS total_document_pages INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS indexed_pages_at_start INTEGER DEFAULT NULL;