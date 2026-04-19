
-- =========================================================
-- 1. ENUMS
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.file_visibility_role AS ENUM ('intern', 'alle', 'eigentuemer', 'mieter', 'personen');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.file_source AS ENUM ('manual', 'email', 'invoice', 'booking', 'meeting');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- 2. building_files Erweiterungen
-- =========================================================
ALTER TABLE public.building_files
  ADD COLUMN IF NOT EXISTS visibility_role public.file_visibility_role NOT NULL DEFAULT 'intern',
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_file_id uuid REFERENCES public.building_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_current_version boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS linked_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS maintenance_config_id uuid,
  ADD COLUMN IF NOT EXISTS linked_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS linked_billing_period_id uuid REFERENCES public.billing_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_email_id uuid,
  ADD COLUMN IF NOT EXISTS source public.file_source NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Migration alt -> neu: visible_to_users -> visibility_role
UPDATE public.building_files
SET visibility_role = CASE WHEN visible_to_users THEN 'alle'::public.file_visibility_role ELSE 'intern'::public.file_visibility_role END
WHERE visibility_role = 'intern' AND visible_to_users IS NOT NULL;

-- Volltext-Suchindex
CREATE INDEX IF NOT EXISTS building_files_search_idx ON public.building_files
USING gin (
  to_tsvector('german',
    coalesce(display_name,'') || ' ' ||
    coalesce(description,'') || ' ' ||
    coalesce(extracted_text,'')
  )
);

CREATE INDEX IF NOT EXISTS building_files_building_idx ON public.building_files(building_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS building_files_category_idx ON public.building_files(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS building_files_parent_idx ON public.building_files(parent_file_id);

-- =========================================================
-- 3. building_file_categories Erweiterungen
-- =========================================================
ALTER TABLE public.building_file_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.building_file_categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS auto_rag_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug text;

CREATE INDEX IF NOT EXISTS building_file_categories_building_idx ON public.building_file_categories(building_id);
CREATE INDEX IF NOT EXISTS building_file_categories_parent_idx ON public.building_file_categories(parent_id);

-- =========================================================
-- 4. building_file_visibility (Mehrfach-Personenfreigabe)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.building_file_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.building_files(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (file_id, contact_id)
);

ALTER TABLE public.building_file_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage file visibility"
ON public.building_file_visibility FOR ALL
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Users see own visibility entries"
ON public.building_file_visibility FOR SELECT
USING (contact_id IN (SELECT id FROM public.contacts WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS bfv_file_idx ON public.building_file_visibility(file_id);
CREATE INDEX IF NOT EXISTS bfv_contact_idx ON public.building_file_visibility(contact_id);

-- =========================================================
-- 5. building_file_activity (Audit-Log)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.building_file_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.building_files(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.building_file_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view file activity"
ON public.building_file_activity FOR SELECT
USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins insert file activity"
ON public.building_file_activity FOR INSERT
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE INDEX IF NOT EXISTS bfa_file_idx ON public.building_file_activity(file_id, created_at DESC);

-- =========================================================
-- 6. RLS Update für building_files (visibility_role + Personen-Freigabe + Papierkorb)
-- =========================================================
DROP POLICY IF EXISTS "Tenants can view their files" ON public.building_files;
DROP POLICY IF EXISTS "WEG owners can view their files" ON public.building_files;

CREATE POLICY "Tenants can view their files v2"
ON public.building_files FOR SELECT
USING (
  deleted_at IS NULL
  AND public.get_user_role(auth.uid()) = 'tenant'::app_role
  AND (
    visibility_role IN ('alle','mieter')
    OR assigned_user_id = auth.uid()
    OR id IN (
      SELECT bfv.file_id FROM public.building_file_visibility bfv
      JOIN public.contacts c ON c.id = bfv.contact_id
      WHERE c.user_id = auth.uid()
    )
  )
  AND building_id IN (
    SELECT building_id FROM public.profiles WHERE user_id = auth.uid() AND building_id IS NOT NULL
    UNION
    SELECT building_id FROM public.tenants WHERE user_id = auth.uid()
  )
);

CREATE POLICY "WEG owners can view their files v2"
ON public.building_files FOR SELECT
USING (
  deleted_at IS NULL
  AND public.get_user_role(auth.uid()) = 'weg_owner'::app_role
  AND (
    visibility_role IN ('alle','eigentuemer')
    OR assigned_user_id = auth.uid()
    OR id IN (
      SELECT bfv.file_id FROM public.building_file_visibility bfv
      JOIN public.contacts c ON c.id = bfv.contact_id
      WHERE c.user_id = auth.uid()
    )
  )
  AND building_id IN (
    SELECT building_id FROM public.weg_owner_buildings WHERE user_id = auth.uid()
  )
);

-- =========================================================
-- 7. RPC: ensure_stammakte_categories(building_id)
-- =========================================================
CREATE OR REPLACE FUNCTION public.ensure_stammakte_categories(p_building_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode public.management_mode;
  v_stammakte uuid; v_vertraege uuid; v_protokolle uuid; v_pruefberichte uuid;
  v_finanzen uuid; v_korrespondenz uuid; v_sonstiges uuid; v_eigentuemer uuid;
BEGIN
  SELECT management_mode INTO v_mode FROM public.buildings WHERE id = p_building_id;
  IF v_mode IS NULL THEN RETURN; END IF;

  -- Top-Level
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, is_recommended, auto_rag_enabled)
  VALUES ('Stammakte','stammakte',p_building_id,v_mode,'folder-archive','#6366F1',10,true,true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_stammakte FROM public.building_file_categories WHERE building_id=p_building_id AND slug='stammakte' LIMIT 1;

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, auto_rag_enabled)
  VALUES ('Verträge','vertraege',p_building_id,v_mode,'file-signature','#0EA5E9',20,true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_vertraege FROM public.building_file_categories WHERE building_id=p_building_id AND slug='vertraege' LIMIT 1;

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, auto_rag_enabled)
  VALUES ('Protokolle','protokolle',p_building_id,v_mode,'file-text','#10B981',30,true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_protokolle FROM public.building_file_categories WHERE building_id=p_building_id AND slug='protokolle' LIMIT 1;

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, auto_rag_enabled, is_recommended)
  VALUES ('Prüfberichte','pruefberichte',p_building_id,v_mode,'shield-check','#F59E0B',40,true,true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_pruefberichte FROM public.building_file_categories WHERE building_id=p_building_id AND slug='pruefberichte' LIMIT 1;

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order)
  VALUES ('Finanzen','finanzen',p_building_id,v_mode,'wallet','#8B5CF6',50)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_finanzen FROM public.building_file_categories WHERE building_id=p_building_id AND slug='finanzen' LIMIT 1;

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order)
  VALUES ('Eigentümer / Mieter','personen',p_building_id,v_mode,'users','#EC4899',60)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_eigentuemer FROM public.building_file_categories WHERE building_id=p_building_id AND slug='personen' LIMIT 1;

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order)
  VALUES ('Korrespondenz','korrespondenz',p_building_id,v_mode,'mail','#64748B',70)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_korrespondenz FROM public.building_file_categories WHERE building_id=p_building_id AND slug='korrespondenz' LIMIT 1;

  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order)
  VALUES ('Sonstiges','sonstiges',p_building_id,v_mode,'folder','#94A3B8',999)
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_sonstiges FROM public.building_file_categories WHERE building_id=p_building_id AND slug='sonstiges' LIMIT 1;

  -- Stammakte Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, is_recommended, auto_rag_enabled) VALUES
    ('Teilungserklärung','stammakte-teilungserklaerung',p_building_id,v_mode,'file-text','#6366F1',1,v_stammakte,true,true),
    ('Gemeinschaftsordnung','stammakte-gemeinschaftsordnung',p_building_id,v_mode,'file-text','#6366F1',2,v_stammakte,true,true),
    ('Hausordnung','stammakte-hausordnung',p_building_id,v_mode,'file-text','#6366F1',3,v_stammakte,true,true),
    ('Grundbuchauszug','stammakte-grundbuch',p_building_id,v_mode,'file-text','#6366F1',4,v_stammakte,false,true),
    ('Versicherungen','stammakte-versicherungen',p_building_id,v_mode,'shield','#6366F1',5,v_stammakte,true,true),
    ('Stammdatenblätter','stammakte-stammdaten',p_building_id,v_mode,'file-text','#6366F1',6,v_stammakte,false,true)
  ON CONFLICT DO NOTHING;

  -- Verträge Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, auto_rag_enabled) VALUES
    ('Versorgerverträge','vertraege-versorger',p_building_id,v_mode,'zap','#0EA5E9',1,v_vertraege,true),
    ('Dienstleisterverträge','vertraege-dienstleister',p_building_id,v_mode,'wrench','#0EA5E9',2,v_vertraege,true),
    ('Bankverträge','vertraege-bank',p_building_id,v_mode,'landmark','#0EA5E9',3,v_vertraege,true)
  ON CONFLICT DO NOTHING;

  -- Finanzen Unterordner
  INSERT INTO public.building_file_categories (name, slug, building_id, management_mode, icon, color, sort_order, parent_id, auto_rag_enabled) VALUES
    ('Gesamtabrechnungen','finanzen-gesamtabrechnungen',p_building_id,v_mode,'file-spreadsheet','#8B5CF6',1,v_finanzen,false),
    ('Einzelabrechnungen','finanzen-einzelabrechnungen',p_building_id,v_mode,'file-spreadsheet','#8B5CF6',2,v_finanzen,false),
    ('Wirtschaftspläne','finanzen-wirtschaftsplaene',p_building_id,v_mode,'file-spreadsheet','#8B5CF6',3,v_finanzen,false),
    ('Rechnungen','finanzen-rechnungen',p_building_id,v_mode,'receipt','#8B5CF6',4,v_finanzen,false),
    ('Kontoauszüge','finanzen-kontoauszuege',p_building_id,v_mode,'landmark','#8B5CF6',5,v_finanzen,false)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Eindeutige Constraint für slug pro Gebäude (verhindert Doppel-Seed)
CREATE UNIQUE INDEX IF NOT EXISTS bfc_building_slug_uidx
  ON public.building_file_categories(building_id, slug)
  WHERE building_id IS NOT NULL AND slug IS NOT NULL;

-- =========================================================
-- 8. Cleanup: alte gebäudespezifische RAG-Dokumente löschen
-- =========================================================
DO $$
DECLARE v_doc_count int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='building_documents') THEN
    SELECT count(*) INTO v_doc_count FROM public.building_documents WHERE building_id IS NOT NULL;
    DELETE FROM public.building_documents WHERE building_id IS NOT NULL;
    RAISE NOTICE 'Deleted % building-specific RAG documents', v_doc_count;
  END IF;
END $$;
