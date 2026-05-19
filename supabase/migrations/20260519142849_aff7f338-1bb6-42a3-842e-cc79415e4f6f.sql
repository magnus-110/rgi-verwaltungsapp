CREATE OR REPLACE FUNCTION public.get_dashboard_global_stats(p_management_mode management_mode)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_building_ids uuid[];
  v_subscribed_account_ids uuid[];
  v_open_reports int := 0;
  v_open_cases int := 0;
  v_open_invoices int := 0;
  v_unread_emails int := 0;
  v_today_tasks jsonb := '[]'::jsonb;
  v_week_tasks jsonb := '[]'::jsonb;
  v_today_maintenance jsonb := '[]'::jsonb;
  v_week_maintenance jsonb := '[]'::jsonb;
  v_upcoming_maintenance jsonb := '[]'::jsonb;
  v_recent_activity jsonb := '[]'::jsonb;
  v_buildings_summary jsonb := '[]'::jsonb;
BEGIN
  BEGIN
    SELECT public.user_has_admin_access(v_user_id) INTO v_is_admin;
  EXCEPTION WHEN OTHERS THEN v_is_admin := false;
  END;

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

  IF p_management_mode = 'weg' THEN
    SELECT count(*) INTO v_open_reports FROM weg_reports
    WHERE status = 'open' AND building_id = ANY(v_building_ids);
  ELSE
    SELECT count(*) INTO v_open_reports FROM miete_reports
    WHERE status = 'open' AND building_id = ANY(v_building_ids);
  END IF;

  SELECT count(*) INTO v_open_cases FROM cases
  WHERE building_id = ANY(v_building_ids)
    AND status::text IN ('open','in_progress','waiting_external')
    AND management_mode = p_management_mode;

  BEGIN
    SELECT count(*) INTO v_open_invoices FROM invoices
    WHERE status = 'open'
      AND (
        building_id = ANY(v_building_ids)
        OR (v_is_admin AND building_id IS NULL)
      );
  EXCEPTION WHEN OTHERS THEN v_open_invoices := 0; END;

  -- NEW: count unread emails only in mailboxes the user is subscribed to
  BEGIN
    SELECT array_agg(account_id) INTO v_subscribed_account_ids
    FROM email_account_subscriptions
    WHERE user_id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_subscribed_account_ids := NULL; END;

  BEGIN
    IF v_subscribed_account_ids IS NULL OR array_length(v_subscribed_account_ids, 1) IS NULL THEN
      v_unread_emails := 0;
    ELSE
      SELECT count(*) INTO v_unread_emails FROM emails
      WHERE coalesce(is_read, false) = false
        AND deleted_at IS NULL
        AND account_id = ANY(v_subscribed_account_ids);
    END IF;
  EXCEPTION WHEN OTHERS THEN v_unread_emails := 0; END;

  BEGIN
    SELECT coalesce(jsonb_agg(t ORDER BY (t->>'due_date')), '[]'::jsonb) INTO v_today_tasks
    FROM (
      SELECT DISTINCT ON (td.id) jsonb_build_object(
        'id', td.id, 'title', td.title, 'priority', td.priority,
        'due_date', td.due_date, 'status', td.status,
        'is_overdue', (td.due_date::date < current_date)
      ) as t, td.due_date, td.id
      FROM todos td
      LEFT JOIN todo_assignments ta ON ta.todo_id = td.id
      WHERE td.status != 'done'
        AND td.due_date::date <= current_date
        AND (
          td.created_by = v_user_id
          OR ta.user_id = v_user_id
          OR (v_is_admin AND td.building_id = ANY(v_building_ids))
        )
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_today_tasks := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(t ORDER BY (t->>'due_date')), '[]'::jsonb) INTO v_week_tasks
    FROM (
      SELECT DISTINCT ON (td.id) jsonb_build_object(
        'id', td.id, 'title', td.title, 'priority', td.priority,
        'due_date', td.due_date, 'status', td.status
      ) as t, td.due_date, td.id
      FROM todos td
      LEFT JOIN todo_assignments ta ON ta.todo_id = td.id
      WHERE td.status != 'done'
        AND td.due_date::date > current_date
        AND td.due_date::date <= current_date + interval '7 days'
        AND (
          td.created_by = v_user_id
          OR ta.user_id = v_user_id
          OR (v_is_admin AND td.building_id = ANY(v_building_ids))
        )
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_week_tasks := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'title', m.title, 'building_name', b.name,
      'due_date', m.due_date, 'maintenance_type', m.maintenance_type
    ) ORDER BY m.due_date), '[]'::jsonb) INTO v_today_maintenance
    FROM maintenance_schedule m
    JOIN buildings b ON b.id = m.building_id
    WHERE m.building_id = ANY(v_building_ids)
      AND m.status = 'pending'
      AND m.due_date::date = current_date;
  EXCEPTION WHEN OTHERS THEN v_today_maintenance := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'title', m.title, 'building_name', b.name,
      'due_date', m.due_date, 'maintenance_type', m.maintenance_type
    ) ORDER BY m.due_date), '[]'::jsonb) INTO v_week_maintenance
    FROM maintenance_schedule m
    JOIN buildings b ON b.id = m.building_id
    WHERE m.building_id = ANY(v_building_ids)
      AND m.status = 'pending'
      AND m.due_date::date > current_date
      AND m.due_date::date <= current_date + interval '7 days';
  EXCEPTION WHEN OTHERS THEN v_week_maintenance := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'title', m.title, 'building_name', b.name,
      'due_date', m.due_date, 'maintenance_type', m.maintenance_type
    ) ORDER BY m.due_date), '[]'::jsonb) INTO v_upcoming_maintenance
    FROM maintenance_schedule m
    JOIN buildings b ON b.id = m.building_id
    WHERE m.building_id = ANY(v_building_ids)
      AND m.status = 'pending'
      AND m.due_date::date > current_date + interval '7 days'
      AND m.due_date::date <= current_date + interval '30 days';
  EXCEPTION WHEN OTHERS THEN v_upcoming_maintenance := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(act ORDER BY (act->>'occurred_at') DESC), '[]'::jsonb)
    INTO v_recent_activity
    FROM (
      SELECT jsonb_build_object(
        'type', 'report', 'id', r.id, 'title', r.title,
        'building_name', b.name, 'occurred_at', r.created_at
      ) as act
      FROM weg_reports r
      JOIN buildings b ON b.id = r.building_id
      WHERE r.building_id = ANY(v_building_ids)
        AND r.created_at > now() - interval '7 days'
        AND p_management_mode = 'weg'
      UNION ALL
      SELECT jsonb_build_object(
        'type', 'report', 'id', r.id, 'title', r.title,
        'building_name', b.name, 'occurred_at', r.created_at
      )
      FROM miete_reports r
      JOIN buildings b ON b.id = r.building_id
      WHERE r.building_id = ANY(v_building_ids)
        AND r.created_at > now() - interval '7 days'
        AND p_management_mode = 'rent'
      UNION ALL
      SELECT jsonb_build_object(
        'type', 'case', 'id', c.id, 'title', c.title,
        'building_name', b.name, 'occurred_at', c.created_at
      )
      FROM cases c
      JOIN buildings b ON b.id = c.building_id
      WHERE c.building_id = ANY(v_building_ids)
        AND c.created_at > now() - interval '7 days'
        AND c.management_mode = p_management_mode
      ORDER BY 1 DESC
      LIMIT 10
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_recent_activity := '[]'::jsonb; END;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'address', b.address,
      'open_reports', coalesce((
        SELECT count(*) FROM weg_reports WHERE building_id = b.id AND status = 'open'
          AND p_management_mode = 'weg'
      ), 0) + coalesce((
        SELECT count(*) FROM miete_reports WHERE building_id = b.id AND status = 'open'
          AND p_management_mode = 'rent'
      ), 0),
      'open_cases', coalesce((
        SELECT count(*) FROM cases WHERE building_id = b.id
          AND status::text IN ('open','in_progress','waiting_external')
          AND management_mode = p_management_mode
      ), 0)
    ) ORDER BY b.name), '[]'::jsonb) INTO v_buildings_summary
    FROM buildings b
    WHERE b.id = ANY(v_building_ids);
  EXCEPTION WHEN OTHERS THEN v_buildings_summary := '[]'::jsonb; END;

  RETURN jsonb_build_object(
    'open_reports', v_open_reports,
    'open_cases', v_open_cases,
    'open_invoices', v_open_invoices,
    'unread_emails', v_unread_emails,
    'today_tasks', v_today_tasks,
    'week_tasks', v_week_tasks,
    'today_maintenance', v_today_maintenance,
    'week_maintenance', v_week_maintenance,
    'upcoming_maintenance', v_upcoming_maintenance,
    'recent_activity', v_recent_activity,
    'buildings_summary', v_buildings_summary
  );
END;
$function$;