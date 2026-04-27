CREATE TABLE public.sepa_mandate_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  contact_id uuid,
  building_id uuid,
  mandate_reference text,
  creditor_id text,
  creditor_name text,
  iban text,
  account_holder text,
  mandate_text text NOT NULL,
  mandate_text_hash text NOT NULL,
  accepted boolean NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  session_id text,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sepa_audit_user ON public.sepa_mandate_audit_log(user_id);
CREATE INDEX idx_sepa_audit_building ON public.sepa_mandate_audit_log(building_id);
CREATE INDEX idx_sepa_audit_contact ON public.sepa_mandate_audit_log(contact_id);
CREATE INDEX idx_sepa_audit_event_type ON public.sepa_mandate_audit_log(event_type);

ALTER TABLE public.sepa_mandate_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own sepa audit entries"
ON public.sepa_mandate_audit_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own sepa audit entries"
ON public.sepa_mandate_audit_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sepa audit entries"
ON public.sepa_mandate_audit_log
FOR SELECT
TO authenticated
USING (public.user_has_admin_access(auth.uid()));

CREATE OR REPLACE FUNCTION public.prevent_sepa_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'sepa_mandate_audit_log is append-only — UPDATE/DELETE not permitted';
END;
$$;

CREATE TRIGGER trg_prevent_sepa_audit_update
  BEFORE UPDATE ON public.sepa_mandate_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sepa_audit_mutation();

CREATE TRIGGER trg_prevent_sepa_audit_delete
  BEFORE DELETE ON public.sepa_mandate_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sepa_audit_mutation();