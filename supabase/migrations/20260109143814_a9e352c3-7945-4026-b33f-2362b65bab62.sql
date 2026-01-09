-- Drop and recreate the search_document_chunks function to include document_id
DROP FUNCTION IF EXISTS public.search_document_chunks(vector, uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.search_document_chunks(
  query_embedding vector(1024),
  filter_building_id uuid DEFAULT NULL::uuid,
  include_general boolean DEFAULT true,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  building_id uuid,
  category text,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      WHEN filter_building_id IS NOT NULL AND include_general THEN
        dc.building_id = filter_building_id OR dc.category = 'general'
      WHEN filter_building_id IS NOT NULL THEN
        dc.building_id = filter_building_id
      WHEN include_general THEN
        dc.category = 'general' OR dc.building_id IS NOT NULL
      ELSE
        TRUE
    END
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;