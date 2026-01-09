-- Add document type tracking columns to building_documents
ALTER TABLE building_documents
ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS extraction_method text;

-- Add comment for documentation
COMMENT ON COLUMN building_documents.document_type IS 'Type of document: native, scan, or hybrid';
COMMENT ON COLUMN building_documents.extraction_method IS 'Method used for text extraction: direct, ocr, or hybrid';