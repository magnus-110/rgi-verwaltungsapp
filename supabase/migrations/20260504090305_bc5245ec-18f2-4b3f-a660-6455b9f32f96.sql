
-- =============================================================
-- Phase 1 — KI-Buchen RAG-Fundament
-- =============================================================

-- 1) booking_embeddings
CREATE TABLE IF NOT EXISTS public.booking_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
  management_mode public.management_mode NOT NULL,
  input_text text NOT NULL,
  embedding vector(1024) NOT NULL,
  -- Schnellzugriff
  creditor_name text,
  amount numeric,
  booking_type text,
  purpose_text text,
  account_number text,
  account_name text,
  counter_account_number text,
  counter_account_name text,
  booking_description text,
  is_35a_relevant boolean DEFAULT false,
  source text NOT NULL DEFAULT 'confirmed_human',
  embedded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_embeddings_building_mode
  ON public.booking_embeddings (building_id, management_mode);
CREATE INDEX IF NOT EXISTS idx_booking_embeddings_mode
  ON public.booking_embeddings (management_mode);
CREATE INDEX IF NOT EXISTS idx_booking_embeddings_hnsw
  ON public.booking_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ALTER TABLE public.booking_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read booking_embeddings via building access"
  ON public.booking_embeddings FOR SELECT
  USING (
    public.user_has_admin_access(auth.uid())
    OR (building_id IS NOT NULL AND public.user_can_access_building(auth.uid(), building_id))
  );

-- Inserts/Updates/Deletes nur durch Service-Role (kein USING/WITH CHECK Policy für andere Rollen)

-- 2) vendor_memory (liegenschaftsübergreifend)
CREATE TABLE IF NOT EXISTS public.vendor_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_iban text,
  vendor_name_normalized text NOT NULL DEFAULT '',
  management_mode public.management_mode NOT NULL,
  account_number text NOT NULL,
  account_category text,
  purpose_pattern text,
  usage_count integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  is_35a_relevant boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_memory_identity_check
    CHECK (vendor_iban IS NOT NULL OR vendor_name_normalized <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_memory_identity
  ON public.vendor_memory (
    COALESCE(vendor_iban, ''),
    vendor_name_normalized,
    management_mode,
    account_number
  );
CREATE INDEX IF NOT EXISTS idx_vendor_memory_lookup
  ON public.vendor_memory (vendor_iban, vendor_name_normalized, management_mode);

ALTER TABLE public.vendor_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read vendor_memory for staff"
  ON public.vendor_memory FOR SELECT
  TO authenticated
  USING (public.user_has_admin_access(auth.uid()));

-- 3) ai_booking_feedback
CREATE TABLE IF NOT EXISTS public.ai_booking_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
  management_mode public.management_mode,
  ai_suggested_account_id uuid,
  ai_suggested_counter_account_id uuid,
  ai_suggested_booking_type text,
  ai_confidence_score numeric CHECK (ai_confidence_score IS NULL OR (ai_confidence_score >= 0 AND ai_confidence_score <= 1)),
  user_accepted boolean,
  user_corrected_account_id uuid,
  user_corrected_counter_account_id uuid,
  user_corrected_booking_type text,
  rag_example_ids uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_ai_booking_feedback_building
  ON public.ai_booking_feedback (building_id, created_at DESC);

ALTER TABLE public.ai_booking_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read ai_booking_feedback via building access"
  ON public.ai_booking_feedback FOR SELECT
  USING (
    public.user_has_admin_access(auth.uid())
    OR (building_id IS NOT NULL AND public.user_can_access_building(auth.uid(), building_id))
  );

CREATE POLICY "Insert ai_booking_feedback via building access"
  ON public.ai_booking_feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_admin_access(auth.uid())
    OR (building_id IS NOT NULL AND public.user_can_access_building(auth.uid(), building_id))
  );

-- 4) RPC find_similar_bookings (mit gestuftem Scope)
CREATE OR REPLACE FUNCTION public.find_similar_bookings(
  query_embedding vector(1024),
  p_building_id uuid,
  p_management_mode public.management_mode,
  p_match_count integer DEFAULT 6,
  p_similarity_threshold double precision DEFAULT 0.72,
  p_include_other_buildings boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  similarity double precision,
  scope text,
  source text,
  creditor_name text,
  amount numeric,
  booking_type text,
  purpose_text text,
  account_number text,
  account_name text,
  counter_account_number text,
  counter_account_name text,
  booking_description text,
  is_35a_relevant boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_count integer := 0;
BEGIN
  -- Stufe 1: gleiche Liegenschaft
  RETURN QUERY
  SELECT
    be.id,
    1 - (be.embedding <=> query_embedding) AS similarity,
    'building'::text AS scope,
    be.source,
    be.creditor_name, be.amount, be.booking_type, be.purpose_text,
    be.account_number, be.account_name,
    be.counter_account_number, be.counter_account_name,
    be.booking_description, be.is_35a_relevant
  FROM public.booking_embeddings be
  WHERE be.building_id = p_building_id
    AND be.management_mode = p_management_mode
    AND (1 - (be.embedding <=> query_embedding)) >= p_similarity_threshold
  ORDER BY be.embedding <=> query_embedding
  LIMIT p_match_count;

  GET DIAGNOSTICS found_count = ROW_COUNT;

  -- Stufe 2: Cold-Start — andere Liegenschaften mit gleichem Modus
  IF p_include_other_buildings AND found_count < GREATEST(p_match_count / 2, 1) THEN
    RETURN QUERY
    SELECT
      be.id,
      1 - (be.embedding <=> query_embedding) AS similarity,
      'mode'::text AS scope,
      be.source,
      be.creditor_name, be.amount, be.booking_type, be.purpose_text,
      be.account_number, be.account_name,
      be.counter_account_number, be.counter_account_name,
      be.booking_description, be.is_35a_relevant
    FROM public.booking_embeddings be
    WHERE be.management_mode = p_management_mode
      AND (be.building_id IS DISTINCT FROM p_building_id)
      AND (1 - (be.embedding <=> query_embedding)) >= p_similarity_threshold
    ORDER BY be.embedding <=> query_embedding
    LIMIT (p_match_count - found_count);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.find_similar_bookings(vector, uuid, public.management_mode, integer, double precision, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.find_similar_bookings(vector, uuid, public.management_mode, integer, double precision, boolean) TO authenticated, service_role;

-- 5) RPC find_vendor_memory
CREATE OR REPLACE FUNCTION public.find_vendor_memory(
  p_vendor_iban text,
  p_vendor_name text,
  p_management_mode public.management_mode
)
RETURNS TABLE (
  account_number text,
  account_category text,
  usage_count integer,
  is_35a_relevant boolean,
  purpose_pattern text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    vm.account_number,
    vm.account_category,
    vm.usage_count,
    vm.is_35a_relevant,
    vm.purpose_pattern
  FROM public.vendor_memory vm
  WHERE vm.management_mode = p_management_mode
    AND (
      (p_vendor_iban IS NOT NULL AND vm.vendor_iban = p_vendor_iban)
      OR (
        p_vendor_name IS NOT NULL
        AND vm.vendor_name_normalized <> ''
        AND vm.vendor_name_normalized = lower(regexp_replace(p_vendor_name, '[^a-zA-Z0-9]+', '', 'g'))
      )
    )
  ORDER BY vm.usage_count DESC, vm.last_used_at DESC
  LIMIT 5;
$$;

REVOKE ALL ON FUNCTION public.find_vendor_memory(text, text, public.management_mode) FROM public;
GRANT EXECUTE ON FUNCTION public.find_vendor_memory(text, text, public.management_mode) TO authenticated, service_role;

-- 6) Trigger: ruft Edge Function asynchron via pg_net
CREATE OR REPLACE FUNCTION public.trg_enqueue_booking_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_anon text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Bei Updates: nur enqueuen, wenn relevante Felder sich geändert haben
  IF TG_OP = 'UPDATE' THEN
    IF NEW.account_id IS NOT DISTINCT FROM OLD.account_id
       AND NEW.counter_account_id IS NOT DISTINCT FROM OLD.counter_account_id
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.booking_type IS NOT DISTINCT FROM OLD.booking_type
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
  END IF;

  v_url := 'https://eebphowrbarzawwixqcc.supabase.co/functions/v1/generate-booking-embeddings';
  v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYnBob3dyYmFyemF3d2l4cWNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mzc2NDksImV4cCI6MjA2OTAxMzY0OX0.Ntd9QxBmN09Xbyg6ken2GFrXukNpDk9Hc0oMIubT7tg';

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','apikey', v_anon, 'Authorization', 'Bearer ' || v_anon),
    body := jsonb_build_object('booking_id', NEW.id)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_enqueue_booking_embedding error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_embed_on_change ON public.bookings;
CREATE TRIGGER trg_bookings_embed_on_change
AFTER INSERT OR UPDATE OF account_id, counter_account_id, amount, booking_type, description, status
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_enqueue_booking_embedding();
