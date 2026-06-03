
DROP POLICY IF EXISTS "Admins can read rgi-invoice-templates" ON storage.objects;
DROP POLICY IF EXISTS "Admins can insert rgi-invoice-templates" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update rgi-invoice-templates" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete rgi-invoice-templates" ON storage.objects;

CREATE POLICY "Admins can read rgi-invoice-templates"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'rgi-invoice-templates' AND public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can insert rgi-invoice-templates"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'rgi-invoice-templates' AND public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can update rgi-invoice-templates"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'rgi-invoice-templates' AND public.user_has_admin_access(auth.uid()))
WITH CHECK (bucket_id = 'rgi-invoice-templates' AND public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can delete rgi-invoice-templates"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'rgi-invoice-templates' AND public.user_has_admin_access(auth.uid()));
