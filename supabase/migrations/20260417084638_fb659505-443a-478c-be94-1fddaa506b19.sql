
-- ============ ENUMS ============
CREATE TYPE public.case_status AS ENUM ('open', 'in_progress', 'waiting_external', 'waiting_owner', 'resolved', 'archived');
CREATE TYPE public.case_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.case_category AS ENUM ('schaden', 'versicherung', 'maengel', 'eigentuemerwechsel', 'rechtliches', 'instandhaltung', 'sonstiges');
CREATE TYPE public.case_event_type AS ENUM ('note', 'email', 'document', 'image', 'todo', 'booking', 'meeting', 'phone', 'status_change', 'ai_summary', 'file');
CREATE TYPE public.case_participant_role AS ENUM ('geschaedigter', 'verursacher', 'gutachter', 'versicherer', 'handwerker', 'eigentuemer', 'mieter', 'behoerde', 'sonstiges');

-- ============ HELPER FUNCTION (avoid RLS recursion) ============
CREATE OR REPLACE FUNCTION public.user_can_access_building(_user_id uuid, _building_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_has_admin_access(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.building_managers bm
      WHERE bm.building_id = _building_id AND bm.user_id = _user_id
    );
$$;

-- ============ CASES ============
CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  management_mode public.management_mode NOT NULL,
  title text NOT NULL,
  description text,
  category public.case_category NOT NULL DEFAULT 'sonstiges',
  status public.case_status NOT NULL DEFAULT 'open',
  priority public.case_priority NOT NULL DEFAULT 'medium',
  assignee_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  unit_number text,
  due_at timestamptz,
  closed_at timestamptz,
  external_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_summary text,
  ai_summary_updated_at timestamptz,
  ai_keywords text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cases_building ON public.cases(building_id);
CREATE INDEX idx_cases_status ON public.cases(status);
CREATE INDEX idx_cases_assignee ON public.cases(assignee_user_id);
CREATE INDEX idx_cases_keywords ON public.cases USING GIN(ai_keywords);

-- ============ CASE EVENTS ============
CREATE TABLE public.case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  event_type public.case_event_type NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  title text,
  body text,
  source_table text,
  source_id uuid,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_events_case ON public.case_events(case_id, occurred_at DESC);
CREATE INDEX idx_case_events_building ON public.case_events(building_id);
CREATE INDEX idx_case_events_source ON public.case_events(source_table, source_id);

-- ============ CASE PARTICIPANTS ============
CREATE TABLE public.case_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  role public.case_participant_role NOT NULL DEFAULT 'sonstiges',
  display_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_participants_case ON public.case_participants(case_id);

-- ============ EMAIL EXTENSION ============
ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_case_suggestion_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_case_confidence numeric;

CREATE INDEX IF NOT EXISTS idx_emails_case ON public.emails(case_id);

-- ============ REPORTS EXTENSION ============
ALTER TABLE public.weg_reports
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;

ALTER TABLE public.miete_reports
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;

-- ============ TRIGGERS ============
CREATE TRIGGER trg_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RLS ============
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_participants ENABLE ROW LEVEL SECURITY;

-- cases policies
CREATE POLICY "cases_select" ON public.cases FOR SELECT TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "cases_insert" ON public.cases FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id) AND created_by = auth.uid());

CREATE POLICY "cases_update" ON public.cases FOR UPDATE TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "cases_delete" ON public.cases FOR DELETE TO authenticated
  USING (public.user_has_admin_access(auth.uid()));

-- case_events policies
CREATE POLICY "case_events_select" ON public.case_events FOR SELECT TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "case_events_insert" ON public.case_events FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id) AND created_by = auth.uid());

CREATE POLICY "case_events_update" ON public.case_events FOR UPDATE TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "case_events_delete" ON public.case_events FOR DELETE TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id));

-- case_participants policies
CREATE POLICY "case_participants_select" ON public.case_participants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND public.user_can_access_building(auth.uid(), c.building_id)));

CREATE POLICY "case_participants_insert" ON public.case_participants FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND public.user_can_access_building(auth.uid(), c.building_id)));

CREATE POLICY "case_participants_update" ON public.case_participants FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND public.user_can_access_building(auth.uid(), c.building_id)));

CREATE POLICY "case_participants_delete" ON public.case_participants FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND public.user_can_access_building(auth.uid(), c.building_id)));
