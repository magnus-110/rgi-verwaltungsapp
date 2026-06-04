
CREATE TABLE public.etv_protocol_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  placeholder_schema JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_protocol_templates TO authenticated;
GRANT ALL ON public.etv_protocol_templates TO service_role;
ALTER TABLE public.etv_protocol_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage protocol templates" ON public.etv_protocol_templates
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));
CREATE POLICY "Authenticated read protocol templates" ON public.etv_protocol_templates
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.etv_protocol_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.etv_meetings(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.etv_protocol_templates(id) ON DELETE SET NULL,
  format TEXT NOT NULL CHECK (format IN ('docx','pdf','pdf_signed')),
  storage_path TEXT NOT NULL,
  is_signed BOOLEAN NOT NULL DEFAULT false,
  dms_file_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_protocol_renders TO authenticated;
GRANT ALL ON public.etv_protocol_renders TO service_role;
ALTER TABLE public.etv_protocol_renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage protocol renders" ON public.etv_protocol_renders
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE TABLE public.etv_protocol_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.etv_meetings(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('leiter','protokollant','eigentuemer')),
  signer_name TEXT NOT NULL,
  signer_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  signature_png TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_etv_protocol_signatures_meeting ON public.etv_protocol_signatures(meeting_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_protocol_signatures TO authenticated;
GRANT ALL ON public.etv_protocol_signatures TO service_role;
ALTER TABLE public.etv_protocol_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage protocol signatures" ON public.etv_protocol_signatures
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE TRIGGER trg_etv_protocol_templates_updated
  BEFORE UPDATE ON public.etv_protocol_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX uniq_etv_protocol_default ON public.etv_protocol_templates(is_default) WHERE is_default = true;
