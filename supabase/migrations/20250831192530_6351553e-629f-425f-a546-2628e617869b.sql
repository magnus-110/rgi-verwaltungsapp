
-- Storage-Policies für privaten Bucket "report-attachments"
-- Sicheres Lesen via signierter URL (Besitzer + Admin), Upload für authentifizierte Nutzer

-- 1) Upload erlauben (INSERT) für authentifizierte Nutzer in genau diesem Bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Authenticated can upload report attachments'
  ) THEN
    CREATE POLICY "Authenticated can upload report attachments"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'report-attachments');
  END IF;
END
$$;

-- 2) Besitzer darf eigene Dateien lesen (SELECT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Owners can read own report attachments'
  ) THEN
    CREATE POLICY "Owners can read own report attachments"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'report-attachments' AND owner = auth.uid());
  END IF;
END
$$;

-- 3) Admins dürfen alle Dateien lesen (SELECT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Admins can read all report attachments'
  ) THEN
    CREATE POLICY "Admins can read all report attachments"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'report-attachments'
        AND public.get_user_role(auth.uid()) = 'admin'::app_role
      );
  END IF;
END
$$;
