-- Create enhanced search function with metadata filters
CREATE OR REPLACE FUNCTION search_document_chunks_with_metadata(
  query_embedding vector(1024),
  filter_building_id uuid DEFAULT NULL,
  include_general boolean DEFAULT false,
  match_count int DEFAULT 10,
  search_all_buildings boolean DEFAULT false,
  filter_categories text[] DEFAULT NULL,
  filter_features text[] DEFAULT NULL
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
SECURITY DEFINER
SET search_path = public
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
    -- Existing building logic
    CASE
      WHEN search_all_buildings THEN TRUE
      WHEN filter_building_id IS NOT NULL AND include_general THEN
        dc.building_id = filter_building_id OR dc.building_id IS NULL
      WHEN filter_building_id IS NOT NULL THEN
        dc.building_id = filter_building_id
      WHEN include_general THEN 
        dc.building_id IS NULL
      ELSE TRUE
    END
    -- Category filter: if provided, chunk category must match one of the filter categories
    AND (
      filter_categories IS NULL 
      OR array_length(filter_categories, 1) IS NULL
      OR dc.category = ANY(filter_categories)
      OR dc.metadata->>'category' = ANY(filter_categories)
    )
    -- Feature filter: if provided, chunk metadata must contain at least one feature
    AND (
      filter_features IS NULL 
      OR array_length(filter_features, 1) IS NULL
      OR (
        dc.metadata ? 'features' 
        AND dc.metadata->'features' ?| filter_features
      )
    )
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;