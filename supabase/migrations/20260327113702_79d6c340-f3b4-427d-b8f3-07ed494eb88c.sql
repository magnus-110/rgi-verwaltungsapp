
-- RLS policy for WEG owners to INSERT their own votes
CREATE POLICY "WEG owners can insert their own votes" ON public.etv_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.etv_attendees ea
      JOIN public.contact_building_assignments cba ON cba.id = ea.assignment_id
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE ea.assignment_id = etv_votes.assignment_id
        AND c.user_id = auth.uid()
    )
  );

-- RLS policy for WEG owners to SELECT votes (for live results)
CREATE POLICY "WEG owners can view votes for their meetings" ON public.etv_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.etv_agenda_items ai
      JOIN public.etv_meetings m ON m.id = ai.meeting_id
      JOIN public.contact_building_assignments cba ON cba.building_id = m.building_id
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE ai.id = etv_votes.agenda_item_id
        AND c.user_id = auth.uid()
    )
  );
