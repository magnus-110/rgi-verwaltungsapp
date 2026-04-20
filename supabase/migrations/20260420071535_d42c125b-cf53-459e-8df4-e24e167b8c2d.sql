CREATE OR REPLACE FUNCTION public.get_dashboard_global_stats(p_management_mode management_mode)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_building_ids uuid[];
  v_open_reports int := 0;
  v_open_cases int := 0;
  v_open_invoices int := 0;
  v_unread_emails int := 0;
  v_today_tasks jsonb := '[]'::jsonb;
  v_upcoming_maintenance jsonb := '[]'::jsonb;
  v_recent_activity jsonb := '[]'::jsonb;
  v_buildings_summary jsonb := '[]'::jsonb;
BEGIN
  -- Check admin (use existing helper if present, else fallback to has_role)
  BEGIN
    SELECT has_role(v_user_id, 'admin'::app_role) INTO v_is_admin;
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  -- Determine accessible buildings
  IF v_is_admin THEN
    SELECT array_agg(id) INTO v_building_ids
    FROM buildings WHERE management_mode = p_management_mode;
  ELSE
    SELECT array_agg(b.id) INTO v_building_ids
    FROM buildings b
    JOIN building_managers bm ON bm.building_id = b.id
    WHERE bm.user_id = v_user_id AND b.management_mode = p_management_mode;
  END IF;

  IF v_building_ids IS NULL OR array_length(v_building_ids, 1) IS NULL THEN
    v_building_ids := ARRAY[]::uuid[];
  END IF;

  -- Open reports
  IF p_management_mode = 'weg' THEN
    SELECT count(*) INTO v_open_reports
    FROM weg_reports
    WHERE status = 'open' AND building_id = ANY(v_building_ids);
  ELSE
    SELECT count(*) INTO v_open_reports
    FROM miete_reports
    WHERE status = 'open' AND building_id = ANY(v_building_ids);
  END IF;

  -- Open cases
  SELECT count(*) INTO v_open_cases
  FROM cases
  WHERE building_id = ANY(v_building_ids)
    AND status::text IN ('open','in_progress','waiting_external')
    AND management_mode = p_management_mode;

  -- Open invoices
  BEGIN
    SELECT count(*) INTO v_open_invoices
    FROM invoices
    WHERE status = 'open' AND building_id = ANY(v_building_ids);
  EXCEPTION WHEN OTHERS THEN
    v_open_invoices := 0;
  END;

  -- Unread emails (assigned to a building in scope)
  BEGIN
    SELECT count(*) INTO v_unread_emails
    FROM emails
    WHERE coalesce(is_read, false) = false
      AND building_id = ANY(v_building_ids)
      AND deleted_at IS NULL;
  EXCEPTION WHEN OTHERS THEN
    v_unread_emails := 0;
  END;

  -- Today's tasks (todos due today, assigned to user OR linked to managed buildings)
  BEGIN
    SELECT coalesce(jsonb_agg(t ORDER BY (t->>'due_date')), '[]'::jsonb) INTO v_today_tasks
    FROM (
      SELECT DISTINCT jsonb_build_object(
        'id', td.id,
        'title', td.title,
        'priority', td.priority,
        'due_date', td.due_date,
        'status', td.status
      ) as t, td.due_date
      FROM todos td
      LEFT JOIN todo_assignments ta ON ta.todo_id = td.id
      LEFT JOIN todo_buildings tb ON tb.todo_id = td.id
      WHERE td.due_date::date <= (current_date + interval '7 days')::date
        AND td.due_date::date >= current_date
        AND td.status != 'done'
        AND td.deleted_at IS NULL
        AND (
          ta.user_id = v_user_id
          OR tb.building_id = ANY(v_building_ids)
          OR td.created_by = v_user_id
        )
      ORDER BY td.due_date
      LIMIT 10
    ) sub;
  EXCEPTION WHEN OTHERS THEN
    v_today_tasks := '[]'::jsonb;
  END;

  -- Upcoming maintenance (next 30 days)
  BEGIN
    SELECT coalesce(jsonb_agg(m ORDER BY (m->>'next_due_date')), '[]'::jsonb) INTO v_upcoming_maintenance
    FROM (
      SELECT jsonb_build_object(
        'id', bm.id,
        'building_id', bm.building_id,
        'building_name', b.name,
        'task_name', bm.task_name,
        'next_due_date', bm.next_due_date,
        'category', bm.category
      ) as m, bm.next_due_date
      FROM building_maintenance bm
      JOIN buildings b ON b.id = bm.building_id
      WHERE bm.building_id = ANY(v_building_ids)
        AND bm.next_due_date IS NOT NULL
        AND bm.next_due_date <= (current_date + interval '30 days')::date
        AND coalesce(bm.is_active, true) = true
      ORDER BY bm.next_due_date
      LIMIT 10
    ) sub;
  EXCEPTION WHEN OTHERS THEN
    v_upcoming_maintenance := '[]'::jsonb;
  END;

  -- Recent activity: union of latest reports, cases, emails (top 10)
  WITH activity AS (
    -- Reports
    SELECT 'report' as kind, id::text, title as label, created_at as ts, building_id, NULL::text as extra
    FROM (
      SELECT id, title, created_at, building_id FROM weg_reports
      WHERE building_id = ANY(v_building_ids) AND p_management_mode = 'weg'
      UNION ALL
      SELECT id, title, created_at, building_id FROM miete_reports
      WHERE building_id = ANY(v_building_ids) AND p_management_mode = 'rent'
    ) r
    UNION ALL
    -- Cases
    SELECT 'case' as kind, id::text, title, created_at, building_id, status::text
    FROM cases
    WHERE building_id = ANY(v_building_ids) AND management_mode = p_management_mode
  )
  SELECT coalesce(jsonb_agg(a ORDER BY (a->>'ts') DESC), '[]'::jsonb) INTO v_recent_activity
  FROM (
    SELECT jsonb_build_object(
      'kind', activity.kind,
      'id', activity.id,
      'label', activity.label,
      'ts', activity.ts,
      'building_id', activity.building_id,
      'building_name', b.name,
      'extra', activity.extra
    ) as a
    FROM activity
    LEFT JOIN buildings b ON b.id = activity.building_id
    ORDER BY activity.ts DESC
    LIMIT 10
  ) sub;

  -- Buildings summary with critical counts
  SELECT coalesce(jsonb_agg(bs ORDER BY (bs->>'open_count')::int DESC, (bs->>'name')), '[]'::jsonb) INTO v_buildings_summary
  FROM (
    SELECT jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'address', b.address,
      'unit_count', b.unit_count,
      'open_count', (
        CASE WHEN p_management_mode = 'weg' THEN
          (SELECT count(*) FROM weg_reports WHERE building_id = b.id AND status = 'open')
        ELSE
          (SELECT count(*) FROM miete_reports WHERE building_id = b.id AND status = 'open')
        END
      ) +
      (SELECT count(*) FROM cases WHERE building_id = b.id AND status::text IN ('open','in_progress','waiting_external'))
    ) as bs
    FROM buildings b
    WHERE b.id = ANY(v_building_ids)
  ) sub;

  RETURN jsonb_build_object(
    'open_reports', v_open_reports,
    'open_cases', v_open_cases,
    'open_invoices', v_open_invoices,
    'unread_emails', v_unread_emails,
    'today_tasks', v_today_tasks,
    'upcoming_maintenance', v_upcoming_maintenance,
    'recent_activity', v_recent_activity,
    'buildings_summary', v_buildings_summary,
    'building_count', coalesce(array_length(v_building_ids, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_global_stats(management_mode) TO authenticated;