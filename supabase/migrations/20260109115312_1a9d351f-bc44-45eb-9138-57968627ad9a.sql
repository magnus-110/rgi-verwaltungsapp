-- Add processing progress columns to building_documents
ALTER TABLE building_documents
ADD COLUMN IF NOT EXISTS processing_progress integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_step text;

-- Enable realtime for building_documents
ALTER TABLE building_documents REPLICA IDENTITY FULL;

-- Add to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'building_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE building_documents;
  END IF;
END $$;