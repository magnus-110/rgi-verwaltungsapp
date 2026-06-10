CREATE TABLE public.key_global_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  tag_template_path TEXT,
  tag_template_name TEXT,
  tag_template_uploaded_at TIMESTAMPTZ,
  tag_template_uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.key_global_settings TO authenticated;
GRANT ALL ON public.key_global_settings TO service_role;
ALTER TABLE public.key_global_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read global key settings" ON public.key_global_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can upsert global key settings" ON public.key_global_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update global key settings" ON public.key_global_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.key_global_settings (id) VALUES ('singleton') ON CONFLICT DO NOTHING;