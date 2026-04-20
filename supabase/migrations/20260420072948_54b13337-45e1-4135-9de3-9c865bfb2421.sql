
-- 1) Neue Spalten an document_chunks
ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES public.building_files(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.building_file_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_slug text,
  ADD COLUMN IF NOT EXISTS category_path text[];

CREATE INDEX IF NOT EXISTS idx_document_chunks_file_id ON public.document_chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_category_id ON public.document_chunks(category_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_category_slug ON public.document_chunks(category_slug);
CREATE INDEX IF NOT EXISTS idx_document_chunks_category_path ON public.document_chunks USING GIN(category_path);

-- 2) Helper: Kategorie-Pfad (Slugs) und Pfad (Names) auflösen
CREATE OR REPLACE FUNCTION public.get_category_path(_category_id uuid)
RETURNS TABLE(slug_path text[], name_path text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, name, slug, 0 AS depth
    FROM public.building_file_categories
    WHERE id = _category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name, c.slug, ch.depth + 1
    FROM public.building_file_categories c
    JOIN chain ch ON ch.parent_id = c.id
  )
  SELECT
    array_agg(COALESCE(slug, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) ORDER BY depth DESC) AS slug_path,
    array_agg(name ORDER BY depth DESC) AS name_path
  FROM chain;
$$;

-- 3) Trigger: Slug + Pfad automatisch ableiten
CREATE OR REPLACE FUNCTION public.fill_chunk_category_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug_path text[];
  v_name_path text[];
BEGIN
  -- file_id gesetzt aber category_id leer? Aus building_files holen
  IF NEW.file_id IS NOT NULL AND NEW.category_id IS NULL THEN
    SELECT category_id INTO NEW.category_id
    FROM public.building_files
    WHERE id = NEW.file_id;
  END IF;

  -- building_id aus building_files übernehmen, wenn nicht gesetzt
  IF NEW.file_id IS NOT NULL AND NEW.building_id IS NULL THEN
    SELECT building_id INTO NEW.building_id
    FROM public.building_files
    WHERE id = NEW.file_id;
  END IF;

  -- Pfad berechnen
  IF NEW.category_id IS NOT NULL THEN
    SELECT slug_path, name_path INTO v_slug_path, v_name_path
    FROM public.get_category_path(NEW.category_id);

    NEW.category_path := v_name_path;
    NEW.category_slug := COALESCE(v_slug_path[array_length(v_slug_path, 1)], NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_chunk_category_metadata ON public.document_chunks;
CREATE TRIGGER trg_fill_chunk_category_metadata
  BEFORE INSERT OR UPDATE OF file_id, category_id ON public.document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_chunk_category_metadata();

-- 4) RPC: search_chunks_by_category
CREATE OR REPLACE FUNCTION public.search_chunks_by_category(
  p_query_embedding vector(1024),
  p_building_id uuid DEFAULT NULL,
  p_category_slugs text[] DEFAULT NULL,
  p_match_count int DEFAULT 8,
  p_min_similarity float DEFAULT 0.0
)
RETURNS TABLE(
  chunk_id uuid,
  file_id uuid,
  building_id uuid,
  category_id uuid,
  category_slug text,
  category_path text[],
  content text,
  metadata jsonb,
  similarity float,
  display_name text,
  file_path text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id AS chunk_id,
    dc.file_id,
    dc.building_id,
    dc.category_id,
    dc.category_slug,
    dc.category_path,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> p_query_embedding) AS similarity,
    bf.display_name,
    bf.file_path
  FROM public.document_chunks dc
  LEFT JOIN public.building_files bf ON bf.id = dc.file_id
  WHERE dc.embedding IS NOT NULL
    AND (p_building_id IS NULL OR dc.building_id = p_building_id OR dc.building_id IS NULL)
    AND (
      p_category_slugs IS NULL
      OR dc.category_slug = ANY(p_category_slugs)
      OR dc.category_path && (
        SELECT array_agg(name)
        FROM public.building_file_categories
        WHERE slug = ANY(p_category_slugs)
      )
    )
    AND (1 - (dc.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY dc.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- 5) RPC: get_category_taxonomy — flache Liste aller (Gebäude+global) Kategorien mit Pfad
CREATE OR REPLACE FUNCTION public.get_category_taxonomy(p_building_id uuid DEFAULT NULL)
RETURNS TABLE(
  category_id uuid,
  name text,
  slug text,
  parent_id uuid,
  building_id uuid,
  path text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS category_id,
    c.name,
    COALESCE(c.slug, lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '-', 'g'))) AS slug,
    c.parent_id,
    c.building_id,
    (SELECT name_path FROM public.get_category_path(c.id)) AS path
  FROM public.building_file_categories c
  WHERE p_building_id IS NULL
     OR c.building_id IS NULL
     OR c.building_id = p_building_id
  ORDER BY c.sort_order NULLS LAST, c.name;
$$;

-- 6) Backfill: bestehende Chunks anhand metadata->>'file_path' mit building_files verknüpfen
UPDATE public.document_chunks dc
SET file_id = bf.id
FROM public.building_files bf
WHERE dc.file_id IS NULL
  AND dc.metadata ? 'file_path'
  AND bf.file_path = (dc.metadata->>'file_path');

-- Trigger erneut feuern, um Slug/Pfad für die Backfilled-Chunks zu setzen
UPDATE public.document_chunks
SET file_id = file_id
WHERE file_id IS NOT NULL AND category_slug IS NULL;
