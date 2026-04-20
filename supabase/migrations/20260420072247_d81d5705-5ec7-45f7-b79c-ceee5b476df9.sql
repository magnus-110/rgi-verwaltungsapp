CREATE OR REPLACE FUNCTION public.get_building_overview(p_building_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mode management_mode;
  v_open_reports int := 0;
  v_open_cases int := 0;
  v_booking_total int := 0;
  v_booking_done int := 0;
  v_booking_pct numeric := 0;
  v_period_label text := '';
  v_period_from date;
  v_period_to date;
  v_top_reports jsonb := '[]'::jsonb;
  v_top_cases jsonb := '[]'::jsonb;
  v_owners jsonb := '[]'::jsonb;
  v_providers jsonb := '[]'::jsonb;
BEGIN
  SELECT management_mode INTO v_mode FROM buildings WHERE id = p_building_id;
  IF v_mode IS NULL THEN
    RETURN jsonb_build_object('error', 'building_not_found');
  END IF;

  IF v_mode = 'weg' THEN
    SELECT count(*) INTO v_open_reports FROM weg_reports WHERE building_id = p_building_id AND status = 'open';
    SELECT coalesce(jsonb_agg(r ORDER BY (r->>'created_at') DESC), '[]'::jsonb) INTO v_top_reports
    FROM (
      SELECT jsonb_build_object(
        'id', id, 'title', title, 'description', description,
        'priority', 'normal', 'created_at', created_at,
        'contact_name', contact_name
      ) as r
      FROM weg_reports
      WHERE building_id = p_building_id AND status = 'open'
      ORDER BY created_at DESC LIMIT 5
    ) sub;
  ELSE
    SELECT count(*) INTO v_open_reports FROM miete_reports WHERE building_id = p_building_id AND status = 'open';
    SELECT coalesce(jsonb_agg(r ORDER BY (r->>'created_at') DESC), '[]'::jsonb) INTO v_top_reports
    FROM (
      SELECT jsonb_build_object(
        'id', id, 'title', title, 'description', description,
        'priority', 'normal', 'created_at', created_at,
        'contact_name', contact_name
      ) as r
      FROM miete_reports
      WHERE building_id = p_building_id AND status = 'open'
      ORDER BY created_at DESC LIMIT 5
    ) sub;
  END IF;

  SELECT count(*) INTO v_open_cases FROM cases
  WHERE building_id = p_building_id AND status::text IN ('open','in_progress','waiting_external');

  SELECT coalesce(jsonb_agg(c ORDER BY (c->>'created_at') DESC), '[]'::jsonb) INTO v_top_cases
  FROM (
    SELECT jsonb_build_object(
      'id', id, 'title', title, 'priority', priority::text,
      'status', status::text, 'category', category::text,
      'created_at', created_at, 'unit_number', unit_number
    ) as c
    FROM cases
    WHERE building_id = p_building_id AND status::text IN ('open','in_progress','waiting_external')
    ORDER BY 
      CASE priority::text 
        WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
        WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      created_at DESC
    LIMIT 5
  ) sub;

  v_period_to := date_trunc('month', current_date)::date - 1;
  v_period_from := date_trunc('month', v_period_to)::date;
  v_period_label := to_char(v_period_from, 'TMMonth YYYY');

  SELECT count(*) INTO v_booking_total
  FROM bank_transactions
  WHERE building_id = p_building_id
    AND booking_date BETWEEN v_period_from AND v_period_to;

  SELECT count(*) INTO v_booking_done
  FROM bank_transactions
  WHERE building_id = p_building_id
    AND booking_date BETWEEN v_period_from AND v_period_to
    AND (booking_id IS NOT NULL OR matched_invoice_id IS NOT NULL OR matched_template_id IS NOT NULL);

  IF v_booking_total > 0 THEN
    v_booking_pct := round((v_booking_done::numeric / v_booking_total::numeric) * 100, 0);
  END IF;

  SELECT coalesce(jsonb_agg(o ORDER BY (o->>'unit_number') NULLS LAST, (o->>'name')), '[]'::jsonb) INTO v_owners
  FROM (
    SELECT jsonb_build_object(
      'assignment_id', cba.id,
      'contact_id', cba.contact_id,
      'unit_number', cba.unit_number,
      'name', coalesce(
        nullif(trim(coalesce(cp.first_name,'') || ' ' || coalesce(cp.last_name,'')), ''),
        c.company_name,
        nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''),
        c.short_name,
        'Unbenannt'
      ),
      'email', (
        SELECT ce.email FROM contact_emails ce
        WHERE ce.contact_id = c.id
        ORDER BY ce.is_primary DESC NULLS LAST LIMIT 1
      ),
      'phone', (
        SELECT cph.phone_number FROM contact_phones cph
        WHERE cph.contact_id = c.id
        ORDER BY cph.id LIMIT 1
      )
    ) as o
    FROM contact_building_assignments cba
    JOIN contacts c ON c.id = cba.contact_id
    LEFT JOIN contact_persons cp ON cp.contact_id = c.id AND cp.is_primary = true
    WHERE cba.building_id = p_building_id
      AND cba.role_in_building::text = 'eigentuemer'
      AND coalesce(cba.is_active, true) = true
  ) sub;

  SELECT coalesce(jsonb_agg(d ORDER BY (d->>'name')), '[]'::jsonb) INTO v_providers
  FROM (
    SELECT DISTINCT ON (c.id) jsonb_build_object(
      'assignment_id', cba.id,
      'contact_id', cba.contact_id,
      'name', coalesce(c.company_name, nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''), c.short_name, 'Dienstleister'),
      'service_category', cba.service_category,
      'email', (
        SELECT ce.email FROM contact_emails ce
        WHERE ce.contact_id = c.id
        ORDER BY ce.is_primary DESC NULLS LAST LIMIT 1
      ),
      'phone', (
        SELECT cph.phone_number FROM contact_phones cph
        WHERE cph.contact_id = c.id
        ORDER BY cph.id LIMIT 1
      )
    ) as d
    FROM contact_building_assignments cba
    JOIN contacts c ON c.id = cba.contact_id
    WHERE cba.building_id = p_building_id
      AND cba.role_in_building::text = 'dienstleister'
      AND coalesce(cba.is_active, true) = true
  ) sub;

  RETURN jsonb_build_object(
    'open_reports_count', v_open_reports,
    'open_cases_count', v_open_cases,
    'booking_progress', jsonb_build_object(
      'period_label', v_period_label,
      'period_from', v_period_from,
      'period_to', v_period_to,
      'total', v_booking_total,
      'done', v_booking_done,
      'percent', v_booking_pct
    ),
    'top_reports', v_top_reports,
    'top_cases', v_top_cases,
    'owners', v_owners,
    'providers', v_providers
  );
END;
$$;