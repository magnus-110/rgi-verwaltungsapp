-- Teil 2: Helper-Funktion und RLS-Policies aktualisieren

-- 1. Erstelle eine Helper-Funktion die mehrere Rollen prüft
CREATE OR REPLACE FUNCTION public.user_has_admin_access(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_user_role(user_id) IN ('admin'::app_role, 'employee'::app_role)
$$;

-- 2. Aktualisiere RLS-Policies für buildings
DROP POLICY IF EXISTS "Admins can manage buildings" ON public.buildings;
CREATE POLICY "Admins and employees can manage buildings" ON public.buildings
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 3. Aktualisiere RLS-Policies für building_documents
DROP POLICY IF EXISTS "Admins can manage building documents" ON public.building_documents;
CREATE POLICY "Admins and employees can manage building documents" ON public.building_documents
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 4. Aktualisiere RLS-Policies für building_managers
DROP POLICY IF EXISTS "Admins can manage building managers" ON public.building_managers;
CREATE POLICY "Admins and employees can manage building managers" ON public.building_managers
  FOR ALL USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

-- 5. Aktualisiere RLS-Policies für forum_posts (nur die Admin-Policy)
DROP POLICY IF EXISTS "Admins can manage all forum posts" ON public.forum_posts;
DROP POLICY IF EXISTS "Admins can manage forum posts" ON public.forum_posts;
CREATE POLICY "Admins and employees can manage forum posts" ON public.forum_posts
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 6. Aktualisiere RLS-Policies für miete_reports
DROP POLICY IF EXISTS "Admins can manage miete reports" ON public.miete_reports;
CREATE POLICY "Admins and employees can manage miete reports" ON public.miete_reports
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 7. Aktualisiere RLS-Policies für weg_reports
DROP POLICY IF EXISTS "Admins can manage weg reports" ON public.weg_reports;
CREATE POLICY "Admins and employees can manage weg reports" ON public.weg_reports
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 8. Aktualisiere RLS-Policies für tenants
DROP POLICY IF EXISTS "Admins can manage tenants" ON public.tenants;
CREATE POLICY "Admins and employees can manage tenants" ON public.tenants
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 9. Aktualisiere RLS-Policies für weg_owners
DROP POLICY IF EXISTS "Admins can manage weg owners" ON public.weg_owners;
CREATE POLICY "Admins and employees can manage weg owners" ON public.weg_owners
  FOR ALL USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

-- 10. Aktualisiere RLS-Policies für weg_owner_buildings
DROP POLICY IF EXISTS "Admins can manage weg owner buildings" ON public.weg_owner_buildings;
CREATE POLICY "Admins and employees can manage weg owner buildings" ON public.weg_owner_buildings
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 11. Aktualisiere RLS-Policies für profiles (nur view/update, nicht insert)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins and employees can view all profiles" ON public.profiles
  FOR SELECT USING (public.user_has_admin_access(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins and employees can update all profiles" ON public.profiles
  FOR UPDATE USING (public.user_has_admin_access(auth.uid()));

-- 12. Aktualisiere RLS-Policies für document_chunks
DROP POLICY IF EXISTS "Admins can manage document chunks" ON public.document_chunks;
CREATE POLICY "Admins and employees can manage document chunks" ON public.document_chunks
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 13. Aktualisiere RLS-Policies für document_chat_sessions
DROP POLICY IF EXISTS "Admins can manage chat sessions" ON public.document_chat_sessions;
CREATE POLICY "Admins and employees can manage chat sessions" ON public.document_chat_sessions
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 14. Aktualisiere RLS-Policies für document_chat_messages
DROP POLICY IF EXISTS "Admins can manage chat messages" ON public.document_chat_messages;
CREATE POLICY "Admins and employees can manage chat messages" ON public.document_chat_messages
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 15. Aktualisiere RLS-Policies für prompt_categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.prompt_categories;
CREATE POLICY "Admins and employees can manage categories" ON public.prompt_categories
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 16. Aktualisiere RLS-Policies für prompt_templates
DROP POLICY IF EXISTS "Admins can manage prompts" ON public.prompt_templates;
CREATE POLICY "Admins and employees can manage prompts" ON public.prompt_templates
  FOR ALL USING (public.user_has_admin_access(auth.uid()));

-- 17. Aktualisiere RLS-Policies für chatbot_sessions (Admin view)
DROP POLICY IF EXISTS "Admins can view all chatbot sessions" ON public.chatbot_sessions;
CREATE POLICY "Admins and employees can view all chatbot sessions" ON public.chatbot_sessions
  FOR SELECT USING (public.user_has_admin_access(auth.uid()));

-- 18. Aktualisiere RLS-Policies für chatbot_messages (Admin view)
DROP POLICY IF EXISTS "Admin can view all messages" ON public.chatbot_messages;
CREATE POLICY "Admins and employees can view all messages" ON public.chatbot_messages
  FOR SELECT USING (public.user_has_admin_access(auth.uid()));

-- HINWEIS: Diese Policies bleiben NUR für Admin:
-- - chatbot_settings (Chatbot-Konfiguration)
-- - document_chat_settings (NOVA-Einstellungen)  
-- - report_templates (Berichtsvorlagen)
-- - forum_post_templates (Forum-Vorlagen)