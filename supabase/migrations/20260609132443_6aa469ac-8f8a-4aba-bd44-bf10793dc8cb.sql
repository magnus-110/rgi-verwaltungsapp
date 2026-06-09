DROP POLICY IF EXISTS annual_cycle_select ON public.annual_cycle_tasks;

CREATE POLICY annual_cycle_select ON public.annual_cycle_tasks
FOR SELECT
USING (
  public.user_can_access_building(auth.uid(), building_id)
  OR EXISTS (
    SELECT 1 FROM public.weg_owner_buildings wob
    WHERE wob.building_id = annual_cycle_tasks.building_id
      AND wob.user_id = auth.uid()
  )
);