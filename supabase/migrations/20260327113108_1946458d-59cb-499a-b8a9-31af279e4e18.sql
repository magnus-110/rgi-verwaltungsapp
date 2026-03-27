
-- Allow WEG owners to insert their own attendee record (auto-registration)
CREATE POLICY "WEG owners can register themselves as attendees" ON public.etv_attendees
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contact_building_assignments cba
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE cba.id = etv_attendees.assignment_id
        AND c.user_id = auth.uid()
    )
  );

-- Allow WEG owners to update their own attendance (proxy management)
CREATE POLICY "WEG owners can update their own attendance" ON public.etv_attendees
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_building_assignments cba
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE cba.id = etv_attendees.assignment_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contact_building_assignments cba
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE cba.id = etv_attendees.assignment_id
        AND c.user_id = auth.uid()
    )
  );
