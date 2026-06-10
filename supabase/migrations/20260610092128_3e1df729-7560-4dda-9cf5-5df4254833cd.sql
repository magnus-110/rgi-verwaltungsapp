
ALTER TABLE public.building_notes ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'etv';

CREATE TABLE IF NOT EXISTS public.building_note_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  value text NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS building_note_categories_building_value_uidx
  ON public.building_note_categories (building_id, lower(value));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.building_note_categories TO authenticated;
GRANT ALL ON public.building_note_categories TO service_role;

ALTER TABLE public.building_note_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view note categories"
  ON public.building_note_categories FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin'::app_role, 'employee'::app_role])));

CREATE POLICY "Staff can manage note categories"
  ON public.building_note_categories FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin'::app_role, 'employee'::app_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY['admin'::app_role, 'employee'::app_role])));

CREATE OR REPLACE FUNCTION public.tg_building_note_categories_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS building_note_categories_set_updated_at ON public.building_note_categories;
CREATE TRIGGER building_note_categories_set_updated_at
  BEFORE UPDATE ON public.building_note_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_building_note_categories_updated_at();
