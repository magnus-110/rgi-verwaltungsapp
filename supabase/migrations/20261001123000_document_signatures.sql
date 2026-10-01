-- Dokumente direkt in der App unterschreiben
--
-- 1) user_signatures: die hinterlegte Unterschrift je Mitarbeiter
--    (nur der Mitarbeiter selbst kann sie sehen, ändern oder benutzen)
-- 2) document_signature_log: Nachweis, wer welches Dokument wann
--    unterschrieben hat (nur lesen/hinzufügen, nicht ändern oder löschen)

CREATE TABLE IF NOT EXISTS public.user_signatures (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  signature_png text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own signature select" ON public.user_signatures;
CREATE POLICY "Own signature select" ON public.user_signatures
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_rgi_staff());

DROP POLICY IF EXISTS "Own signature insert" ON public.user_signatures;
CREATE POLICY "Own signature insert" ON public.user_signatures
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_rgi_staff());

DROP POLICY IF EXISTS "Own signature update" ON public.user_signatures;
CREATE POLICY "Own signature update" ON public.user_signatures
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_rgi_staff())
  WITH CHECK (user_id = auth.uid() AND public.is_rgi_staff());

DROP POLICY IF EXISTS "Own signature delete" ON public.user_signatures;
CREATE POLICY "Own signature delete" ON public.user_signatures
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.document_signature_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signed_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  signer_name text,
  context text NOT NULL CHECK (context IN ('email_attachment', 'building_file', 'company_file', 'contract', 'other')),
  source_bucket text,
  source_path text,
  source_name text,
  result_bucket text,
  result_path text,
  result_name text,
  result_file_id uuid,
  email_id uuid,
  building_id uuid,
  contract_id uuid,
  placements jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_signature_log_created_idx ON public.document_signature_log (created_at DESC);
CREATE INDEX IF NOT EXISTS document_signature_log_email_idx ON public.document_signature_log (email_id);
CREATE INDEX IF NOT EXISTS document_signature_log_building_idx ON public.document_signature_log (building_id);

ALTER TABLE public.document_signature_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read signature log" ON public.document_signature_log;
CREATE POLICY "Staff read signature log" ON public.document_signature_log
  FOR SELECT TO authenticated
  USING (public.is_rgi_staff());

DROP POLICY IF EXISTS "Staff add own signature log" ON public.document_signature_log;
CREATE POLICY "Staff add own signature log" ON public.document_signature_log
  FOR INSERT TO authenticated
  WITH CHECK (signed_by = auth.uid() AND public.is_rgi_staff());
