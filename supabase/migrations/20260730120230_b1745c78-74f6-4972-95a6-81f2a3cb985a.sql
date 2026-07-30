CREATE TABLE public.etv_date_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.etv_meetings(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  closes_at date NOT NULL,
  intro_text text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.etv_date_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.etv_date_polls(id) ON DELETE CASCADE,
  proposed_date date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.etv_date_poll_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.etv_date_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.etv_date_poll_options(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  choice text NOT NULL,
  earliest_time text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (option_id, contact_id)
);

CREATE TABLE public.etv_date_poll_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.etv_date_polls(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, contact_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_date_polls TO authenticated;
GRANT ALL ON public.etv_date_polls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_date_poll_options TO authenticated;
GRANT ALL ON public.etv_date_poll_options TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_date_poll_responses TO authenticated;
GRANT ALL ON public.etv_date_poll_responses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etv_date_poll_notes TO authenticated;
GRANT ALL ON public.etv_date_poll_notes TO service_role;

ALTER TABLE public.etv_date_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etv_date_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etv_date_poll_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etv_date_poll_notes ENABLE ROW LEVEL SECURITY;

-- Polls
CREATE POLICY "Staff manage date polls" ON public.etv_date_polls
FOR ALL TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Owners view own building polls" ON public.etv_date_polls
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.weg_owner_buildings wob WHERE wob.building_id = etv_date_polls.building_id AND wob.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.contact_building_assignments cba JOIN public.contacts c ON c.id = cba.contact_id WHERE cba.building_id = etv_date_polls.building_id AND c.user_id = auth.uid())
);

-- Options
CREATE POLICY "Staff manage date poll options" ON public.etv_date_poll_options
FOR ALL TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Owners view options of own polls" ON public.etv_date_poll_options
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.etv_date_polls p
  WHERE p.id = etv_date_poll_options.poll_id
    AND (
      EXISTS (SELECT 1 FROM public.weg_owner_buildings wob WHERE wob.building_id = p.building_id AND wob.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.contact_building_assignments cba JOIN public.contacts c ON c.id = cba.contact_id WHERE cba.building_id = p.building_id AND c.user_id = auth.uid())
    )
));

-- Responses
CREATE POLICY "Staff manage date poll responses" ON public.etv_date_poll_responses
FOR ALL TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Owners manage own responses" ON public.etv_date_poll_responses
FOR ALL TO authenticated
USING (contact_id IN (SELECT c.id FROM public.contacts c WHERE c.user_id = auth.uid()))
WITH CHECK (contact_id IN (SELECT c.id FROM public.contacts c WHERE c.user_id = auth.uid()));

-- Notes
CREATE POLICY "Staff manage date poll notes" ON public.etv_date_poll_notes
FOR ALL TO authenticated
USING (public.user_has_admin_access(auth.uid()))
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Owners manage own poll notes" ON public.etv_date_poll_notes
FOR ALL TO authenticated
USING (contact_id IN (SELECT c.id FROM public.contacts c WHERE c.user_id = auth.uid()))
WITH CHECK (contact_id IN (SELECT c.id FROM public.contacts c WHERE c.user_id = auth.uid()));

CREATE TRIGGER trg_etv_date_polls_updated BEFORE UPDATE ON public.etv_date_polls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_etv_date_poll_responses_updated BEFORE UPDATE ON public.etv_date_poll_responses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_etv_date_poll_notes_updated BEFORE UPDATE ON public.etv_date_poll_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_etv_date_poll_options_poll ON public.etv_date_poll_options(poll_id);
CREATE INDEX idx_etv_date_poll_responses_poll ON public.etv_date_poll_responses(poll_id);
CREATE INDEX idx_etv_date_poll_notes_poll ON public.etv_date_poll_notes(poll_id);