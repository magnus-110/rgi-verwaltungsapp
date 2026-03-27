-- Fix: Allow WEG owners to see meetings via weg_owner_buildings table
DROP POLICY IF EXISTS "WEG owners can view their building meetings" ON public.etv_meetings;
CREATE POLICY "WEG owners can view their building meetings" ON public.etv_meetings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.weg_owner_buildings wob
      WHERE wob.building_id = etv_meetings.building_id
        AND wob.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.contact_building_assignments cba
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE cba.building_id = etv_meetings.building_id
        AND c.user_id = auth.uid()
    )
  );

-- Fix: Allow WEG owners to see agenda items via weg_owner_buildings table
DROP POLICY IF EXISTS "WEG owners can view agenda items" ON public.etv_agenda_items;
CREATE POLICY "WEG owners can view agenda items" ON public.etv_agenda_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM etv_meetings m
      JOIN public.weg_owner_buildings wob ON wob.building_id = m.building_id
      WHERE m.id = etv_agenda_items.meeting_id
        AND wob.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM etv_meetings m
      JOIN public.contact_building_assignments cba ON cba.building_id = m.building_id
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE m.id = etv_agenda_items.meeting_id
        AND c.user_id = auth.uid()
    )
  );

-- Fix: Allow WEG owners to submit agenda items via weg_owner_buildings table
DROP POLICY IF EXISTS "WEG owners can submit agenda items" ON public.etv_agenda_items;
CREATE POLICY "WEG owners can submit agenda items" ON public.etv_agenda_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM etv_meetings m
      JOIN public.weg_owner_buildings wob ON wob.building_id = m.building_id
      WHERE m.id = etv_agenda_items.meeting_id
        AND wob.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM etv_meetings m
      JOIN public.contact_building_assignments cba ON cba.building_id = m.building_id
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE m.id = etv_agenda_items.meeting_id
        AND c.user_id = auth.uid()
        AND cba.role_in_building = 'eigentuemer'
    )
  );