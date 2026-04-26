-- 1) New columns
ALTER TABLE public.contact_building_assignments
  ADD COLUMN IF NOT EXISTS area_sqm_override numeric;

ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS etv_default_location text;

-- 2) building_service_providers
CREATE TABLE IF NOT EXISTS public.building_service_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  phone text,
  email text,
  notes text,
  source text NOT NULL DEFAULT 'onboarding',
  suggested_by_count integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsp_building ON public.building_service_providers(building_id);

ALTER TABLE public.building_service_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bsp_admin_employee_all" ON public.building_service_providers;
CREATE POLICY "bsp_admin_employee_all"
  ON public.building_service_providers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')
    )
  );

DROP POLICY IF EXISTS "bsp_managers_read" ON public.building_service_providers;
CREATE POLICY "bsp_managers_read"
  ON public.building_service_providers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.building_managers bm
      WHERE bm.building_id = building_service_providers.building_id
        AND bm.user_id = auth.uid()
    )
  );

-- 3) building_assessments
CREATE TABLE IF NOT EXISTS public.building_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  user_id uuid,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  condition_rating smallint,
  problem_areas text[] NOT NULL DEFAULT '{}',
  willing_cash_audit boolean,
  etv_location_suggestion text,
  notes text,
  source text NOT NULL DEFAULT 'onboarding',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ba_building ON public.building_assessments(building_id);
CREATE INDEX IF NOT EXISTS idx_ba_user ON public.building_assessments(user_id);

ALTER TABLE public.building_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ba_admin_employee_all" ON public.building_assessments;
CREATE POLICY "ba_admin_employee_all"
  ON public.building_assessments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')
    )
  );

DROP POLICY IF EXISTS "ba_managers_read" ON public.building_assessments;
CREATE POLICY "ba_managers_read"
  ON public.building_assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.building_managers bm
      WHERE bm.building_id = building_assessments.building_id
        AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ba_owner_self_select" ON public.building_assessments;
CREATE POLICY "ba_owner_self_select"
  ON public.building_assessments FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ba_owner_self_insert" ON public.building_assessments;
CREATE POLICY "ba_owner_self_insert"
  ON public.building_assessments FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 4) updated_at triggers
DROP TRIGGER IF EXISTS trg_bsp_updated ON public.building_service_providers;
CREATE TRIGGER trg_bsp_updated BEFORE UPDATE ON public.building_service_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ba_updated ON public.building_assessments;
CREATE TRIGGER trg_ba_updated BEFORE UPDATE ON public.building_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();