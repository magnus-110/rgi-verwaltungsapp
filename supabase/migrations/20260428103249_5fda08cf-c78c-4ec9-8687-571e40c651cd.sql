ALTER TABLE public.etv_attendees
  DROP CONSTRAINT IF EXISTS etv_attendees_assignment_id_fkey;

ALTER TABLE public.etv_attendees
  ADD CONSTRAINT etv_attendees_assignment_id_fkey
  FOREIGN KEY (assignment_id)
  REFERENCES public.contact_building_assignments(id) ON DELETE CASCADE;

ALTER TABLE public.etv_votes
  DROP CONSTRAINT IF EXISTS etv_votes_assignment_id_fkey;

ALTER TABLE public.etv_votes
  ADD CONSTRAINT etv_votes_assignment_id_fkey
  FOREIGN KEY (assignment_id)
  REFERENCES public.contact_building_assignments(id) ON DELETE CASCADE;