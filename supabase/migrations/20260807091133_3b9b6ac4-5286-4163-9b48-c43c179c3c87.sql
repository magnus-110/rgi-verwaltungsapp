ALTER TABLE public.etv_agenda_items
  ADD COLUMN IF NOT EXISTS is_management_report boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_sections jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.etv_report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  storage_path text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  placeholder_schema jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_report_templates TO authenticated;
GRANT ALL ON public.etv_report_templates TO service_role;
ALTER TABLE public.etv_report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage report templates" ON public.etv_report_templates
  FOR ALL TO authenticated USING (user_has_admin_access(auth.uid())) WITH CHECK (user_has_admin_access(auth.uid()));
CREATE POLICY "Authenticated read report templates" ON public.etv_report_templates
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_etv_report_templates_updated_at BEFORE UPDATE ON public.etv_report_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.etv_report_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.etv_meetings(id) ON DELETE CASCADE,
  agenda_item_id uuid REFERENCES public.etv_agenda_items(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.etv_report_templates(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  format text NOT NULL DEFAULT 'pdf',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_report_renders TO authenticated;
GRANT ALL ON public.etv_report_renders TO service_role;
ALTER TABLE public.etv_report_renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage report renders" ON public.etv_report_renders
  FOR ALL TO authenticated USING (user_has_admin_access(auth.uid())) WITH CHECK (user_has_admin_access(auth.uid()));