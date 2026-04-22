
-- 0) Bestehende Status-Werte normalisieren
UPDATE public.economic_plans SET status = 'active' WHERE status = 'approved';

-- 1) economic_plans: neue Felder
ALTER TABLE public.economic_plans
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_by UUID,
  ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$ BEGIN
  ALTER TABLE public.economic_plans
    ADD CONSTRAINT economic_plans_source_check
    CHECK (source IN ('previous_year','etv_resolution','manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.economic_plans
    ADD CONSTRAINT economic_plans_status_check
    CHECK (status IN ('draft','active','archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_plan_per_building_year
  ON public.economic_plans (building_id, fiscal_year)
  WHERE status = 'active';

-- 2) Override-Marker auf Gesamtplan-Items
ALTER TABLE public.economic_plan_items
  ADD COLUMN IF NOT EXISTS manually_overridden BOOLEAN NOT NULL DEFAULT false;

-- 3) Einzelplan-Overrides
CREATE TABLE IF NOT EXISTS public.economic_plan_unit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.economic_plans(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL,
  account_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  manually_overridden BOOLEAN NOT NULL DEFAULT true,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  UNIQUE (plan_id, unit_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_epui_plan ON public.economic_plan_unit_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_epui_unit ON public.economic_plan_unit_items(unit_id);

DROP TRIGGER IF EXISTS trg_epui_updated_at ON public.economic_plan_unit_items;
CREATE TRIGGER trg_epui_updated_at
  BEFORE UPDATE ON public.economic_plan_unit_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.economic_plan_unit_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view plan unit items" ON public.economic_plan_unit_items;
CREATE POLICY "Authenticated users can view plan unit items"
  ON public.economic_plan_unit_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert plan unit items" ON public.economic_plan_unit_items;
CREATE POLICY "Authenticated users can insert plan unit items"
  ON public.economic_plan_unit_items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update plan unit items" ON public.economic_plan_unit_items;
CREATE POLICY "Authenticated users can update plan unit items"
  ON public.economic_plan_unit_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete plan unit items" ON public.economic_plan_unit_items;
CREATE POLICY "Authenticated users can delete plan unit items"
  ON public.economic_plan_unit_items FOR DELETE TO authenticated USING (true);

-- 4) Auto-Archivierung
CREATE OR REPLACE FUNCTION public.archive_other_active_plans()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    UPDATE public.economic_plans
    SET status = 'archived', updated_at = now()
    WHERE building_id = NEW.building_id
      AND fiscal_year = NEW.fiscal_year
      AND id <> NEW.id
      AND status = 'active';
    
    IF NEW.activated_at IS NULL THEN
      NEW.activated_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_other_active_plans ON public.economic_plans;
CREATE TRIGGER trg_archive_other_active_plans
  BEFORE INSERT OR UPDATE OF status ON public.economic_plans
  FOR EACH ROW EXECUTE FUNCTION public.archive_other_active_plans();
