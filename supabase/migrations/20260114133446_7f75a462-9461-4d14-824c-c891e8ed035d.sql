-- Drop and recreate the search_document_chunks function with corrected logic
CREATE OR REPLACE FUNCTION public.search_document_chunks(
  query_embedding vector(1024),
  filter_building_id uuid DEFAULT NULL,
  include_general boolean DEFAULT true,
  match_count integer DEFAULT 10,
  search_all_buildings boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  building_id uuid,
  category text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    dc.building_id,
    dc.category,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  WHERE 
    CASE
      -- Specific building with optional general docs
      WHEN filter_building_id IS NOT NULL AND include_general THEN
        dc.building_id = filter_building_id OR dc.category = 'general'
      
      -- Specific building only (no general)
      WHEN filter_building_id IS NOT NULL THEN
        dc.building_id = filter_building_id
      
      -- ALL buildings (with optional general)
      WHEN search_all_buildings AND include_general THEN
        dc.building_id IS NOT NULL OR dc.category = 'general'
      
      -- ALL buildings only (no general)
      WHEN search_all_buildings THEN
        dc.building_id IS NOT NULL
      
      -- ONLY general knowledge (FIXED!)
      WHEN include_general THEN
        dc.category = 'general'
      
      -- Fallback: nothing
      ELSE
        FALSE
    END
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;