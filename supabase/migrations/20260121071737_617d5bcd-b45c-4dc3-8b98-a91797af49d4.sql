-- Add justifications column to store agent reasoning
ALTER TABLE agent_search_results 
ADD COLUMN IF NOT EXISTS justifications jsonb DEFAULT '{}';

-- Add awaiting_review flag for pause-and-review workflow
ALTER TABLE reorganization_jobs 
ADD COLUMN IF NOT EXISTS awaiting_review boolean DEFAULT false;