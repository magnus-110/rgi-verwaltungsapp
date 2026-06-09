
CREATE OR REPLACE FUNCTION public.get_owner_resolution_last_edits(_resolution_ids uuid[])
RETURNS TABLE(resolution_id uuid, last_edit timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, COALESCE(
    (SELECT MAX(occurred_at) FROM case_events WHERE case_id = r.case_id),
    c.updated_at
  )
  FROM etv_resolutions r
  LEFT JOIN cases c ON c.id = r.case_id
  WHERE r.id = ANY(_resolution_ids)
    AND r.published = true
    AND r.is_actionable = true
    AND EXISTS (
      SELECT 1 FROM weg_owner_buildings wob
      WHERE wob.user_id = auth.uid() AND wob.building_id = r.building_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_owner_resolution_last_edits(uuid[]) TO authenticated;
