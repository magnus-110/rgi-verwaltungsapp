CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  category TEXT,
  subject TEXT,
  body TEXT NOT NULL DEFAULT '',
  is_shared BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View shared or own templates"
  ON public.email_templates FOR SELECT TO authenticated
  USING (is_shared = true OR created_by = auth.uid());

CREATE POLICY "Insert own templates"
  ON public.email_templates FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update own templates"
  ON public.email_templates FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Delete own templates"
  ON public.email_templates FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_email_templates_usage ON public.email_templates (last_used_at DESC NULLS LAST, usage_count DESC);