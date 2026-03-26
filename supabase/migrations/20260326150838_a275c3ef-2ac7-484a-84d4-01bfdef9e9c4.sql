
-- Eigentümerversammlungen
CREATE TABLE public.etv_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  quorum_reached BOOLEAN DEFAULT false,
  lock_time TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(user_id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tagesordnungspunkte
CREATE TABLE public.etv_agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.etv_meetings(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  resolution_text TEXT,
  voting_principle TEXT NOT NULL DEFAULT 'mea',
  category TEXT,
  submitted_by_contact_id UUID REFERENCES public.contacts(id),
  status TEXT DEFAULT 'pending',
  result TEXT,
  yes_count NUMERIC DEFAULT 0,
  no_count NUMERIC DEFAULT 0,
  abstain_count NUMERIC DEFAULT 0,
  total_mea_voted NUMERIC DEFAULT 0,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Anwesenheit & Vollmachten
CREATE TABLE public.etv_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.etv_meetings(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.contact_building_assignments(id),
  attendance_type TEXT NOT NULL DEFAULT 'absent',
  proxy_type TEXT,
  proxy_contact_id UUID REFERENCES public.contacts(id),
  proxy_token TEXT UNIQUE,
  proxy_token_used BOOLEAN DEFAULT false,
  pre_vote_instructions JSONB,
  checked_in_at TIMESTAMPTZ,
  voting_banned_items UUID[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Einzelstimmen (Audit-Log)
CREATE TABLE public.etv_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id UUID NOT NULL REFERENCES public.etv_agenda_items(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.contact_building_assignments(id),
  vote TEXT NOT NULL,
  mea_weight NUMERIC,
  voted_by_user_id UUID,
  is_proxy_vote BOOLEAN DEFAULT false,
  is_manual_override BOOLEAN DEFAULT false,
  ip_address TEXT,
  voted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agenda_item_id, assignment_id)
);

-- RLS aktivieren
ALTER TABLE public.etv_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etv_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etv_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etv_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies: etv_meetings
CREATE POLICY "Admins can manage meetings" ON public.etv_meetings
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "WEG owners can view their building meetings" ON public.etv_meetings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_building_assignments cba
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE cba.building_id = etv_meetings.building_id
        AND c.user_id = auth.uid()
    )
  );

-- RLS Policies: etv_agenda_items
CREATE POLICY "Admins can manage agenda items" ON public.etv_agenda_items
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "WEG owners can view agenda items" ON public.etv_agenda_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.etv_meetings m
      JOIN public.contact_building_assignments cba ON cba.building_id = m.building_id
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE m.id = etv_agenda_items.meeting_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "WEG owners can submit agenda items" ON public.etv_agenda_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.etv_meetings m
      JOIN public.contact_building_assignments cba ON cba.building_id = m.building_id
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE m.id = etv_agenda_items.meeting_id
        AND c.user_id = auth.uid()
        AND cba.role_in_building = 'eigentuemer'
    )
  );

-- RLS Policies: etv_attendees
CREATE POLICY "Admins can manage attendees" ON public.etv_attendees
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "WEG owners can view their attendance" ON public.etv_attendees
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_building_assignments cba
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE cba.id = etv_attendees.assignment_id
        AND c.user_id = auth.uid()
    )
  );

-- RLS Policies: etv_votes
CREATE POLICY "Admins can manage votes" ON public.etv_votes
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "WEG owners can view their votes" ON public.etv_votes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contact_building_assignments cba
      JOIN public.contacts c ON c.id = cba.contact_id
      WHERE cba.id = etv_votes.assignment_id
        AND c.user_id = auth.uid()
    )
  );

-- Updated_at Trigger for etv_meetings
CREATE TRIGGER update_etv_meetings_updated_at
  BEFORE UPDATE ON public.etv_meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
