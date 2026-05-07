
CREATE TABLE public.cash_audit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_audit_id uuid NOT NULL REFERENCES public.cash_audits(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cash_audit_notes_audit ON public.cash_audit_notes(cash_audit_id);
ALTER TABLE public.cash_audit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit notes" ON public.cash_audit_notes
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Auditor reads own audit notes" ON public.cash_audit_notes
  FOR SELECT TO authenticated
  USING (
    cash_audit_id IN (
      SELECT id FROM public.cash_audits
      WHERE auditor_contact_id IN (SELECT id FROM public.contacts WHERE user_id = auth.uid())
    )
  );

CREATE TABLE public.cash_audit_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_audit_id uuid NOT NULL REFERENCES public.cash_audits(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cash_audit_statements_audit ON public.cash_audit_statements(cash_audit_id);
ALTER TABLE public.cash_audit_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage audit statements" ON public.cash_audit_statements
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Auditor reads own audit statements" ON public.cash_audit_statements
  FOR SELECT TO authenticated
  USING (
    cash_audit_id IN (
      SELECT id FROM public.cash_audits
      WHERE auditor_contact_id IN (SELECT id FROM public.contacts WHERE user_id = auth.uid())
    )
  );

-- RPCs für Token-Zugriff
CREATE OR REPLACE FUNCTION public.get_audit_notes_by_token(p_token text)
RETURNS SETOF json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_audit uuid;
BEGIN
  SELECT id INTO v_audit FROM cash_audits WHERE access_token = p_token LIMIT 1;
  IF v_audit IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT row_to_json(t) FROM (
    SELECT id, title, body, sort_order, created_at
    FROM cash_audit_notes WHERE cash_audit_id = v_audit
    ORDER BY sort_order, created_at
  ) t;
END; $$;

CREATE OR REPLACE FUNCTION public.get_audit_pdf_statements_by_token(p_token text)
RETURNS SETOF json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_audit uuid;
BEGIN
  SELECT id INTO v_audit FROM cash_audits WHERE access_token = p_token LIMIT 1;
  IF v_audit IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT row_to_json(t) FROM (
    SELECT id, file_name, file_path, sort_order, uploaded_at
    FROM cash_audit_statements WHERE cash_audit_id = v_audit
    ORDER BY sort_order, uploaded_at
  ) t;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_audit_notes_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_pdf_statements_by_token(text) TO anon, authenticated;
