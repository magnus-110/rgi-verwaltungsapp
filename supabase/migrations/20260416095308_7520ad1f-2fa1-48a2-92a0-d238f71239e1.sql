
-- Create cash_audits table
CREATE TABLE public.cash_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  billing_period_id UUID NOT NULL REFERENCES public.billing_periods(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  auditor_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
  access_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  visible_in_portal_until TIMESTAMPTZ,
  progress JSONB NOT NULL DEFAULT '{}',
  signature_data TEXT,
  signed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for token lookups
CREATE INDEX idx_cash_audits_access_token ON public.cash_audits(access_token);
CREATE INDEX idx_cash_audits_building_id ON public.cash_audits(building_id);
CREATE INDEX idx_cash_audits_auditor ON public.cash_audits(auditor_contact_id);

-- Updated_at trigger
CREATE TRIGGER update_cash_audits_updated_at
  BEFORE UPDATE ON public.cash_audits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.cash_audits ENABLE ROW LEVEL SECURITY;

-- Admin/employee: full access
CREATE POLICY "Admins can manage all cash audits"
  ON public.cash_audits
  FOR ALL
  TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

-- Owner: can view and update their own audit (via contact -> user_id)
CREATE POLICY "Auditors can view their own audits"
  ON public.cash_audits
  FOR SELECT
  TO authenticated
  USING (
    auditor_contact_id IN (
      SELECT id FROM public.contacts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Auditors can update their own audits"
  ON public.cash_audits
  FOR UPDATE
  TO authenticated
  USING (
    auditor_contact_id IN (
      SELECT id FROM public.contacts WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    auditor_contact_id IN (
      SELECT id FROM public.contacts WHERE user_id = auth.uid()
    )
  );

-- Security definer RPC for token-based access
CREATE OR REPLACE FUNCTION public.get_audit_by_token(p_token TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(r) FROM (
    SELECT
      ca.id,
      ca.building_id,
      ca.billing_period_id,
      ca.fiscal_year,
      ca.auditor_contact_id,
      ca.status,
      ca.progress,
      ca.signature_data,
      ca.signed_at,
      ca.completed_at,
      ca.notes,
      ca.created_at,
      ca.updated_at,
      json_build_object(
        'name', b.name,
        'address', b.address
      ) as building,
      json_build_object(
        'period_from', bp.period_from,
        'period_to', bp.period_to,
        'fiscal_year', bp.fiscal_year
      ) as billing_period,
      (
        SELECT row_to_json(c)
        FROM (
          SELECT co.id, co.company_name,
            (SELECT json_agg(json_build_object('first_name', cp.first_name, 'last_name', cp.last_name))
             FROM contact_persons cp WHERE cp.contact_id = co.id AND cp.is_primary = true LIMIT 1
            ) as persons
          FROM contacts co WHERE co.id = ca.auditor_contact_id
        ) c
      ) as auditor
    FROM cash_audits ca
    JOIN buildings b ON b.id = ca.building_id
    JOIN billing_periods bp ON bp.id = ca.billing_period_id
    WHERE ca.access_token = p_token
    LIMIT 1
  ) r;
$$;

-- RPC to update audit progress via token (security definer)
CREATE OR REPLACE FUNCTION public.update_audit_by_token(
  p_token TEXT,
  p_progress JSONB DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_signature_data TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audit_row cash_audits;
BEGIN
  SELECT * INTO audit_row FROM cash_audits WHERE access_token = p_token;
  
  IF audit_row.id IS NULL THEN
    RETURN json_build_object('error', 'Audit not found');
  END IF;

  UPDATE cash_audits SET
    progress = COALESCE(p_progress, progress),
    notes = COALESCE(p_notes, notes),
    status = COALESCE(p_status, status),
    signature_data = COALESCE(p_signature_data, signature_data),
    signed_at = CASE WHEN p_signature_data IS NOT NULL THEN now() ELSE signed_at END,
    completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END,
    updated_at = now()
  WHERE id = audit_row.id;

  RETURN json_build_object('success', true, 'id', audit_row.id);
END;
$$;
