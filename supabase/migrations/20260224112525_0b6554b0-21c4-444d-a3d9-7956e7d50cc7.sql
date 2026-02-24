
-- =============================================
-- 1. Kategorien-Tabelle
-- =============================================
CREATE TABLE public.building_file_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  icon text DEFAULT 'file-text',
  color text DEFAULT '#6B7280',
  management_mode public.management_mode NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.building_file_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and employees can manage file categories"
  ON public.building_file_categories FOR ALL
  USING (user_has_admin_access(auth.uid()));

CREATE POLICY "Authenticated users can view file categories"
  ON public.building_file_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =============================================
-- 2. Dateien-Tabelle
-- =============================================
CREATE TABLE public.building_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid REFERENCES public.building_file_categories(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL,
  building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
  assigned_user_id uuid,
  display_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  mime_type text,
  management_mode public.management_mode NOT NULL,
  description text,
  visible_to_users boolean NOT NULL DEFAULT true,
  rag_enabled boolean NOT NULL DEFAULT false,
  extracted_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.building_files ENABLE ROW LEVEL SECURITY;

-- Admin/Mitarbeiter: Voller Zugriff
CREATE POLICY "Admins and employees can manage building files"
  ON public.building_files FOR ALL
  USING (user_has_admin_access(auth.uid()));

-- Mieter: Sehen Gebäude-Dateien + eigene persönliche Dateien
CREATE POLICY "Tenants can view their files"
  ON public.building_files FOR SELECT
  USING (
    visible_to_users = true
    AND get_user_role(auth.uid()) = 'tenant'::app_role
    AND (
      -- Persönliches Dokument
      assigned_user_id = auth.uid()
      -- ODER Gebäude-Dokument (nicht persönlich zugeordnet)
      OR (
        assigned_user_id IS NULL
        AND building_id IN (
          SELECT building_id FROM profiles WHERE user_id = auth.uid() AND building_id IS NOT NULL
          UNION
          SELECT building_id FROM tenants WHERE user_id = auth.uid()
        )
      )
    )
  );

-- WEG-Eigentümer: Sehen Gebäude-Dateien + eigene persönliche Dateien
CREATE POLICY "WEG owners can view their files"
  ON public.building_files FOR SELECT
  USING (
    visible_to_users = true
    AND get_user_role(auth.uid()) = 'weg_owner'::app_role
    AND (
      assigned_user_id = auth.uid()
      OR (
        assigned_user_id IS NULL
        AND building_id IN (
          SELECT building_id FROM weg_owner_buildings WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Trigger für updated_at
CREATE TRIGGER update_building_files_updated_at
  BEFORE UPDATE ON public.building_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 3. Storage Bucket
-- =============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('building-files', 'building-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Admins can upload building files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'building-files' AND user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can update building files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'building-files' AND user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can delete building files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'building-files' AND user_has_admin_access(auth.uid()));

CREATE POLICY "Authenticated users can read building files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'building-files' AND auth.uid() IS NOT NULL);

-- =============================================
-- 4. Standard-Kategorien einfügen
-- =============================================
INSERT INTO public.building_file_categories (name, icon, color, management_mode, sort_order) VALUES
  ('Mietvertrag', 'file-signature', '#3B82F6', 'rent', 1),
  ('Nebenkostenabrechnung', 'calculator', '#10B981', 'rent', 2),
  ('Hausordnung', 'scroll-text', '#F59E0B', 'rent', 3),
  ('Protokoll', 'clipboard-list', '#8B5CF6', 'rent', 4),
  ('Sonstiges', 'file', '#6B7280', 'rent', 5),
  ('Hausgeldabrechnung', 'calculator', '#10B981', 'weg', 1),
  ('Teilungserklärung', 'file-signature', '#3B82F6', 'weg', 2),
  ('Versammlungsprotokoll', 'clipboard-list', '#8B5CF6', 'weg', 3),
  ('Hausordnung', 'scroll-text', '#F59E0B', 'weg', 4),
  ('Wirtschaftsplan', 'bar-chart', '#EC4899', 'weg', 5),
  ('Sonstiges', 'file', '#6B7280', 'weg', 6);
