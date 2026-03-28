-- Drop the problematic circular policies
DROP POLICY IF EXISTS "WEG owners can view contacts in same buildings" ON contacts;
DROP POLICY IF EXISTS "WEG owners can view other owners in same building" ON contact_building_assignments;

-- Security definer function to get contact IDs of owners in user's buildings
CREATE OR REPLACE FUNCTION public.get_owner_contact_ids_in_user_buildings(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cba.contact_id
  FROM contact_building_assignments cba
  WHERE cba.building_id IN (SELECT public.get_user_building_ids(_user_id))
  AND cba.role_in_building = 'eigentuemer'
$$;

-- Security definer function to get assignment IDs of other owners in user's buildings
CREATE OR REPLACE FUNCTION public.get_owner_assignments_in_user_buildings(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cba.id
  FROM contact_building_assignments cba
  WHERE cba.building_id IN (SELECT public.get_user_building_ids(_user_id))
  AND cba.role_in_building = 'eigentuemer'
$$;

-- Re-create policies using security definer functions (no circular RLS)
CREATE POLICY "WEG owners can view other owners in same building"
ON contact_building_assignments FOR SELECT TO authenticated
USING (
  id IN (SELECT public.get_owner_assignments_in_user_buildings(auth.uid()))
);

CREATE POLICY "WEG owners can view contacts in same buildings"
ON contacts FOR SELECT TO authenticated
USING (
  id IN (SELECT public.get_owner_contact_ids_in_user_buildings(auth.uid()))
);