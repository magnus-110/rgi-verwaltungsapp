
-- 1. Fix contact_persons RLS
DROP POLICY IF EXISTS "Authenticated users can manage contact persons" ON public.contact_persons;

CREATE POLICY "Admins and employees can manage contact persons"
ON public.contact_persons
FOR ALL
TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Building members can view contact persons"
ON public.contact_persons
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contact_building_assignments cba
    WHERE cba.contact_id = contact_persons.contact_id
      AND cba.building_id IN (SELECT public.get_user_building_ids(auth.uid()))
  )
);

-- 2. Fix economic_plans RLS
DROP POLICY IF EXISTS "Authenticated users can manage economic_plans" ON public.economic_plans;

CREATE POLICY "Admins and employees can manage economic plans"
ON public.economic_plans
FOR ALL
TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

-- 3. Fix economic_plan_items RLS
DROP POLICY IF EXISTS "Authenticated users can manage economic_plan_items" ON public.economic_plan_items;

CREATE POLICY "Admins and employees can manage economic plan items"
ON public.economic_plan_items
FOR ALL
TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

-- 4. Add admin guard to assign_building_manager
CREATE OR REPLACE FUNCTION public.assign_building_manager(building_id_param uuid, user_id_param uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_admin_access(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin privileges required';
  END IF;

  INSERT INTO public.building_managers (building_id, user_id)
  VALUES (building_id_param, user_id_param);
END;
$function$;

-- 5. Add admin guard to remove_building_manager
CREATE OR REPLACE FUNCTION public.remove_building_manager(manager_id_param uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_admin_access(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin privileges required';
  END IF;

  DELETE FROM public.building_managers
  WHERE id = manager_id_param;
END;
$function$;
