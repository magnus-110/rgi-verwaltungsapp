-- Allow tenants to view their own building
CREATE POLICY "Tenants can view their building"
ON public.buildings
FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM public.profiles WHERE building_id = buildings.id
    UNION
    SELECT user_id FROM public.tenants WHERE building_id = buildings.id
  )
);

-- Allow WEG owners to view their buildings (if they have building access)
CREATE POLICY "WEG owners can view accessible buildings"
ON public.buildings
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'weg_owner'::app_role
);