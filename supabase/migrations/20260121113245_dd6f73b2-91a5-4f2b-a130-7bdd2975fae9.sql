-- Add tracking columns to building_documents for better indexing monitoring
ALTER TABLE building_documents
ADD COLUMN IF NOT EXISTS indexing_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS indexing_last_activity TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS indexing_error_message TEXT;

-- Add tracking columns to reorganization_jobs
ALTER TABLE reorganization_jobs
ADD COLUMN IF NOT EXISTS indexing_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;