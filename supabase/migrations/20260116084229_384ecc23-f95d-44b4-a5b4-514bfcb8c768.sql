-- Add title column to document_chat_sessions for auto-generated conversation titles
ALTER TABLE document_chat_sessions 
ADD COLUMN IF NOT EXISTS title TEXT;

-- Add building_ids column for multi-building selection (array of UUIDs)
ALTER TABLE document_chat_sessions 
ADD COLUMN IF NOT EXISTS building_ids UUID[] DEFAULT '{}'::uuid[];