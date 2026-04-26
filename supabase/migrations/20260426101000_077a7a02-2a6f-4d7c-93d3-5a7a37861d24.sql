CREATE TABLE IF NOT EXISTS public.building_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  title text,
  content text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_building_notes_building ON public.building_notes(building_id, created_at DESC);

ALTER TABLE public.building_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view building notes"
ON public.building_notes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')));

CREATE POLICY "Staff can insert building notes"
ON public.building_notes FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')));

CREATE POLICY "Staff can update building notes"
ON public.building_notes FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')));

CREATE POLICY "Staff can delete building notes"
ON public.building_notes FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')));

CREATE OR REPLACE FUNCTION public.touch_building_notes_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_building_notes_updated ON public.building_notes;
CREATE TRIGGER trg_building_notes_updated BEFORE UPDATE ON public.building_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_building_notes_updated_at();