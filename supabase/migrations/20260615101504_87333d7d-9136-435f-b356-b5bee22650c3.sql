
-- Duplikate von automatisch generierten Wartungs-Tasks aufräumen.
-- Pro (building_id, maintenance_type) wird nur der älteste offene Task behalten.
DELETE FROM public.todos t
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY building_id, maintenance_type
           ORDER BY due_date ASC, created_at ASC
         ) AS rn
  FROM public.todos
  WHERE is_maintenance_task = true
    AND status NOT IN ('done', 'cancelled')
) dups
WHERE t.id = dups.id
  AND dups.rn > 1;
