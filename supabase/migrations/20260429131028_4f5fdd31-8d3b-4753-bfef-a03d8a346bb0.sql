-- Helper: ist dieser contact_id in irgendeinem Gebäude des Users als Notfallkontakt aktiv?
CREATE OR REPLACE FUNCTION public.is_emergency_contact_for_user(_contact_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contact_building_assignments cba
    JOIN public.weg_owner_buildings wob
      ON wob.building_id = cba.building_id
    WHERE cba.contact_id = _contact_id
      AND cba.is_emergency_contact = true
      AND cba.is_active = true
      AND wob.user_id = _user_id
  );
$$;

CREATE POLICY "Owners can view emergency provider contacts"
ON public.contacts FOR SELECT TO authenticated
USING (public.is_emergency_contact_for_user(id, auth.uid()));

CREATE POLICY "Owners can view emergency provider phones"
ON public.contact_phones FOR SELECT TO authenticated
USING (public.is_emergency_contact_for_user(contact_id, auth.uid()));

CREATE POLICY "Owners can view emergency provider emails"
ON public.contact_emails FOR SELECT TO authenticated
USING (public.is_emergency_contact_for_user(contact_id, auth.uid()));