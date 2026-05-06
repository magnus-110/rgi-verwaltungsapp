
-- Status enum
DO $$ BEGIN
  CREATE TYPE public.annual_cycle_status AS ENUM ('open', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main table
CREATE TABLE IF NOT EXISTS public.annual_cycle_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  fiscal_year_start date NOT NULL,
  fiscal_year_end date NOT NULL,
  task_key text NOT NULL,
  status public.annual_cycle_status NOT NULL DEFAULT 'open',
  completed_at date,
  note text,
  auto_managed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, fiscal_year_start, task_key)
);

CREATE INDEX IF NOT EXISTS idx_annual_cycle_building_year
  ON public.annual_cycle_tasks (building_id, fiscal_year_start);

ALTER TABLE public.annual_cycle_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "annual_cycle_select" ON public.annual_cycle_tasks;
CREATE POLICY "annual_cycle_select" ON public.annual_cycle_tasks
  FOR SELECT TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id));

DROP POLICY IF EXISTS "annual_cycle_insert" ON public.annual_cycle_tasks;
CREATE POLICY "annual_cycle_insert" ON public.annual_cycle_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

DROP POLICY IF EXISTS "annual_cycle_update" ON public.annual_cycle_tasks;
CREATE POLICY "annual_cycle_update" ON public.annual_cycle_tasks
  FOR UPDATE TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id));

DROP POLICY IF EXISTS "annual_cycle_delete" ON public.annual_cycle_tasks;
CREATE POLICY "annual_cycle_delete" ON public.annual_cycle_tasks
  FOR DELETE TO authenticated
  USING (public.user_has_admin_access(auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_annual_cycle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_annual_cycle_updated_at ON public.annual_cycle_tasks;
CREATE TRIGGER trg_annual_cycle_updated_at
BEFORE UPDATE ON public.annual_cycle_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_annual_cycle_updated_at();

-- Seeder RPC: creates the 12 standard task rows for a given building + fiscal year if missing
CREATE OR REPLACE FUNCTION public.seed_annual_cycle_tasks(
  p_building_id uuid,
  p_fiscal_year_start date,
  p_fiscal_year_end date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_keys text[] := ARRAY[
    'heizkostenabrechnung_beantragt',
    'jahresabrechnung_erstellt',
    'vermoegensbericht_erstellt',
    'wirtschaftsplan_erstellt',
    'etv_einberufen',
    'etv_protokoll_fertig',
    'beschlusssammlung_aktualisiert',
    'paragraph_35a_versendet',
    'abrechnungsspitzen_gebucht',
    'hausgeldanpassung_umgesetzt',
    'bankabgleich_jahr_abgeschlossen',
    'jahresabschluss_archiviert'
  ];
  k text;
BEGIN
  IF NOT public.user_can_access_building(auth.uid(), p_building_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOREACH k IN ARRAY task_keys LOOP
    INSERT INTO public.annual_cycle_tasks (building_id, fiscal_year_start, fiscal_year_end, task_key)
    VALUES (p_building_id, p_fiscal_year_start, p_fiscal_year_end, k)
    ON CONFLICT (building_id, fiscal_year_start, task_key) DO NOTHING;
  END LOOP;
END $$;

-- Overview view: one row per building+fiscal_year with all 12 statuses as JSON
CREATE OR REPLACE VIEW public.v_annual_cycle_overview AS
SELECT
  act.building_id,
  b.name AS building_name,
  b.management_mode,
  act.fiscal_year_start,
  act.fiscal_year_end,
  jsonb_object_agg(act.task_key, jsonb_build_object(
    'id', act.id,
    'status', act.status,
    'completed_at', act.completed_at,
    'note', act.note
  )) AS tasks,
  COUNT(*) FILTER (WHERE act.status = 'done') AS done_count,
  COUNT(*) FILTER (WHERE act.status = 'in_progress') AS in_progress_count,
  COUNT(*) FILTER (WHERE act.status = 'open') AS open_count
FROM public.annual_cycle_tasks act
JOIN public.buildings b ON b.id = act.building_id
GROUP BY act.building_id, b.name, b.management_mode, act.fiscal_year_start, act.fiscal_year_end;
