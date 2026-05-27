CREATE OR REPLACE FUNCTION public.get_audit_by_token(p_token text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT row_to_json(r) FROM (
    SELECT
      ca.id,
      ca.building_id,
      ca.billing_period_id,
      ca.fiscal_year,
      ca.auditor_contact_id,
      ca.auditor_name_override,
      ca.status,
      ca.progress,
      ca.signature_data,
      ca.signed_at,
      ca.completed_at,
      ca.notes,
      ca.created_at,
      ca.updated_at,
      json_build_object(
        'name', b.name,
        'address', b.address
      ) as building,
      json_build_object(
        'period_from', bp.period_from,
        'period_to', bp.period_to,
        'fiscal_year', bp.fiscal_year
      ) as billing_period,
      (
        SELECT row_to_json(c)
        FROM (
          SELECT co.id, co.company_name,
            (SELECT json_agg(json_build_object('first_name', cp.first_name, 'last_name', cp.last_name))
             FROM contact_persons cp WHERE cp.contact_id = co.id
            ) as persons
          FROM contacts co WHERE co.id = ca.auditor_contact_id
        ) c
      ) as auditor
    FROM cash_audits ca
    JOIN buildings b ON b.id = ca.building_id
    JOIN billing_periods bp ON bp.id = ca.billing_period_id
    WHERE ca.access_token = p_token
    LIMIT 1
  ) r;
$function$;