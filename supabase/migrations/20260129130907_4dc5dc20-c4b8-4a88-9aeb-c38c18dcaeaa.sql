-- Drop all PDF reorganization related tables and columns

-- First, drop foreign key constraints on related tables
ALTER TABLE reorganized_documents DROP CONSTRAINT IF EXISTS reorganized_documents_agent_id_fkey;
ALTER TABLE reorganized_documents DROP CONSTRAINT IF EXISTS reorganized_documents_job_id_fkey;
ALTER TABLE reorganized_documents DROP CONSTRAINT IF EXISTS reorganized_documents_source_document_id_fkey;
ALTER TABLE reorganized_documents DROP CONSTRAINT IF EXISTS reorganized_documents_building_id_fkey;

ALTER TABLE agent_search_results DROP CONSTRAINT IF EXISTS agent_search_results_agent_id_fkey;
ALTER TABLE agent_search_results DROP CONSTRAINT IF EXISTS agent_search_results_job_id_fkey;

ALTER TABLE reorganization_jobs DROP CONSTRAINT IF EXISTS reorganization_jobs_preset_id_fkey;
ALTER TABLE reorganization_jobs DROP CONSTRAINT IF EXISTS reorganization_jobs_source_document_id_fkey;
ALTER TABLE reorganization_jobs DROP CONSTRAINT IF EXISTS reorganization_jobs_building_id_fkey;
ALTER TABLE reorganization_jobs DROP CONSTRAINT IF EXISTS reorganization_jobs_created_by_fkey;

ALTER TABLE document_page_index DROP CONSTRAINT IF EXISTS document_page_index_document_id_fkey;

ALTER TABLE agent_presets DROP CONSTRAINT IF EXISTS agent_presets_created_by_fkey;

ALTER TABLE reorganization_agents DROP CONSTRAINT IF EXISTS reorganization_agents_created_by_fkey;

-- Drop the tables in order (most dependent first)
DROP TABLE IF EXISTS reorganized_documents CASCADE;
DROP TABLE IF EXISTS agent_search_results CASCADE;
DROP TABLE IF EXISTS reorganization_jobs CASCADE;
DROP TABLE IF EXISTS document_page_index CASCADE;
DROP TABLE IF EXISTS agent_presets CASCADE;
DROP TABLE IF EXISTS reorganization_agents CASCADE;

-- Drop reorganization-related columns from building_documents
ALTER TABLE building_documents 
  DROP COLUMN IF EXISTS indexing_status,
  DROP COLUMN IF EXISTS indexed_pages,
  DROP COLUMN IF EXISTS indexing_started_at,
  DROP COLUMN IF EXISTS indexing_last_activity,
  DROP COLUMN IF EXISTS indexing_error_message;