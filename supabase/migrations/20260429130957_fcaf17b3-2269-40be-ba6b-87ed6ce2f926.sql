CREATE POLICY "WEG owners can view emergency contacts in their buildings"
ON public.contact_building_assignments
FOR SELECT
TO authenticated
USING (
  is_emergency_contact = true
  AND is_active = true
  AND building_id IN (
    SELECT building_id FROM public.weg_owner_buildings WHERE user_id = auth.uid()
  )
);