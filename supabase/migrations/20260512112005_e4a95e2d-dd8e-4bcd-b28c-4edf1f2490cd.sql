
CREATE TABLE public.billing_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  management_mode TEXT NOT NULL DEFAULT 'weg',
  scope TEXT NOT NULL DEFAULT 'single',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.billing_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal users can view billing templates"
ON public.billing_templates FOR SELECT TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'employee'::app_role]));

CREATE POLICY "internal users can insert billing templates"
ON public.billing_templates FOR INSERT TO authenticated
WITH CHECK (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'employee'::app_role]));

CREATE POLICY "internal users can update billing templates"
ON public.billing_templates FOR UPDATE TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'employee'::app_role]));

CREATE POLICY "internal users can delete billing templates"
ON public.billing_templates FOR DELETE TO authenticated
USING (get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'employee'::app_role]));

INSERT INTO storage.buckets (id, name, public) VALUES ('billing-templates', 'billing-templates', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "internal users read billing templates storage"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'billing-templates' AND get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'employee'::app_role]));

CREATE POLICY "internal users upload billing templates storage"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'billing-templates' AND get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'employee'::app_role]));

CREATE POLICY "internal users update billing templates storage"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'billing-templates' AND get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'employee'::app_role]));

CREATE POLICY "internal users delete billing templates storage"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'billing-templates' AND get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'employee'::app_role]));
