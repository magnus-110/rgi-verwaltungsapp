
ALTER TABLE public.buildings ADD COLUMN IF NOT EXISTS takeover_completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.building_takeover_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  section text NOT NULL,
  question_key text NOT NULL,
  value_text text,
  value_number numeric,
  value_date date,
  value_bool boolean,
  notes text,
  status text NOT NULL DEFAULT 'open',
  applied_to text,
  applied_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_bta_building ON public.building_takeover_answers(building_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.building_takeover_answers TO authenticated;
GRANT ALL ON public.building_takeover_answers TO service_role;

ALTER TABLE public.building_takeover_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view takeover answers"
  ON public.building_takeover_answers FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin'::app_role, 'employee'::app_role])));

CREATE POLICY "Staff insert takeover answers"
  ON public.building_takeover_answers FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin'::app_role, 'employee'::app_role])));

CREATE POLICY "Staff update takeover answers"
  ON public.building_takeover_answers FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin'::app_role, 'employee'::app_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin'::app_role, 'employee'::app_role])));

CREATE POLICY "Staff delete takeover answers"
  ON public.building_takeover_answers FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin'::app_role, 'employee'::app_role])));

CREATE TRIGGER trg_bta_updated_at BEFORE UPDATE ON public.building_takeover_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
