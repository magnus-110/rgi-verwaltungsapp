
INSERT INTO storage.buckets (id, name, public) 
VALUES ('paragraph-35a-templates', 'paragraph-35a-templates', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.paragraph_35a_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.paragraph_35a_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal users can view 35a templates"
ON public.paragraph_35a_templates FOR SELECT TO authenticated
USING (public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE POLICY "internal users can insert 35a templates"
ON public.paragraph_35a_templates FOR INSERT TO authenticated
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE POLICY "internal users can update 35a templates"
ON public.paragraph_35a_templates FOR UPDATE TO authenticated
USING (public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE POLICY "internal users can delete 35a templates"
ON public.paragraph_35a_templates FOR DELETE TO authenticated
USING (public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE TRIGGER trg_paragraph_35a_templates_updated_at
BEFORE UPDATE ON public.paragraph_35a_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "internal users read 35a template files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'paragraph-35a-templates' AND public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE POLICY "internal users upload 35a template files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'paragraph-35a-templates' AND public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE POLICY "internal users update 35a template files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'paragraph-35a-templates' AND public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE POLICY "internal users delete 35a template files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'paragraph-35a-templates' AND public.get_user_role(auth.uid()) IN ('admin','employee'));
