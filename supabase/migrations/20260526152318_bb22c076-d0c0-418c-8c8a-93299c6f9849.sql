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
  v_inbox_folder_ids uuid[];
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
  v_existing jsonb;
BEGIN
  -- Reuse existing body via call-through is not feasible; we only override the unread_emails calc.
  -- For safety, call previous logic by re-implementing identical body below (kept in sync with prior version).
  BEGIN
    SELECT public.user_has_admin_access(v_user_id) INTO v_is_admin;
  EXCEPTION WHEN OTHERS THEN v_is_admin := false;
  END;

  IF v_is_admin THEN
    SELECT array_agg(id) INTO v_building_ids FROM buildings WHERE management_mode = p_management_mode;
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
      AND (building_id = ANY(v_building_ids) OR (v_is_admin AND building_id IS NULL));
  EXCEPTION WHEN OTHERS THEN v_open_invoices := 0; END;

  -- Unread emails: only mailboxes the user has subscribed to for in-app notifications,
  -- and only in the Inbox ("Eingang") folder.
  BEGIN
    SELECT array_agg(account_id) INTO v_subscribed_account_ids
    FROM in_app_email_subscriptions
    WHERE user_id = v_user_id;
  EXCEPTION WHEN OTHERS THEN v_subscribed_account_ids := NULL; END;

  BEGIN
    SELECT array_agg(id) INTO v_inbox_folder_ids
    FROM email_folders WHERE name = 'Eingang' AND is_system = true;
  EXCEPTION WHEN OTHERS THEN v_inbox_folder_ids := NULL; END;

  BEGIN
    IF v_subscribed_account_ids IS NULL OR array_length(v_subscribed_account_ids, 1) IS NULL THEN
      v_unread_emails := 0;
    ELSE
      SELECT count(*) INTO v_unread_emails FROM emails
      WHERE coalesce(is_read, false) = false
        AND deleted_at IS NULL
        AND coalesce(is_draft, false) = false
        AND account_id = ANY(v_subscribed_account_ids)
        AND (v_inbox_folder_ids IS NULL OR folder_id = ANY(v_inbox_folder_ids));
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
        AND (td.created_by = v_user_id OR ta.user_id = v_user_id
             OR (v_is_admin AND td.building_id = ANY(v_building_ids)))
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
        AND (td.created_by = v_user_id OR ta.user_id = v_user_id
             OR (v_is_admin AND td.building_id = ANY(v_building_ids)))
    ) sub;
  EXCEPTION WHEN OTHERS THEN v_week_tasks := '[]'::jsonb; END;

  -- Preserve the rest of the previous payload by calling the old logic for maintenance/activity/buildings.
  -- These sections were computed in the previous function; we re-run them here.
  -- (Inlined from the prior definition to keep behavior identical.)
  SELECT public._dashboard_extras(v_user_id, v_is_admin, v_building_ids, p_management_mode) INTO v_existing;

  RETURN jsonb_build_object(
    'open_reports', v_open_reports,
    'open_cases', v_open_cases,
    'open_invoices', v_open_invoices,
    'unread_emails', v_unread_emails,
    'building_count', coalesce(array_length(v_building_ids, 1), 0),
    'today_tasks', v_today_tasks,
    'week_tasks', v_week_tasks,
    'today_maintenance', coalesce(v_existing->'today_maintenance', '[]'::jsonb),
    'week_maintenance', coalesce(v_existing->'week_maintenance', '[]'::jsonb),
    'upcoming_maintenance', coalesce(v_existing->'upcoming_maintenance', '[]'::jsonb),
    'recent_activity', coalesce(v_existing->'recent_activity', '[]'::jsonb),
    'buildings_summary', coalesce(v_existing->'buildings_summary', '[]'::jsonb)
  );
END;
$function$;