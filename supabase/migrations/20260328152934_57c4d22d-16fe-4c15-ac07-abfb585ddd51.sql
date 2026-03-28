-- Security definer function to get user's building IDs (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_building_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cba.building_id
  FROM contact_building_assignments cba
  JOIN contacts c ON c.id = cba.contact_id
  WHERE c.user_id = _user_id
$$;

-- Allow owners to see other owners' assignments in their buildings
CREATE POLICY "WEG owners can view other owners in same building"
ON contact_building_assignments FOR SELECT TO authenticated
USING (
  building_id IN (SELECT public.get_user_building_ids(auth.uid()))
  AND role_in_building = 'eigentuemer'
);

-- Allow owners to see contact names for owners in same buildings
CREATE POLICY "WEG owners can view contacts in same buildings"
ON contacts FOR SELECT TO authenticated
USING (
  id IN (
    SELECT cba.contact_id FROM contact_building_assignments cba
    WHERE cba.building_id IN (SELECT public.get_user_building_ids(auth.uid()))
    AND cba.role_in_building = 'eigentuemer'
  )
);

-- Add proxy_external_name column for external proxies
ALTER TABLE public.etv_attendees ADD COLUMN IF NOT EXISTS proxy_external_name TEXT;