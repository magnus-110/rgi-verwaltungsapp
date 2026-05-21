CREATE OR REPLACE FUNCTION public.get_audit_pdf_statements_by_token(p_token text)
 RETURNS SETOF json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_audit uuid;
BEGIN
  SELECT id INTO v_audit FROM cash_audits WHERE access_token = p_token LIMIT 1;
  IF v_audit IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT row_to_json(t) FROM (
    SELECT id, file_name, file_path, sort_order, uploaded_at, category
    FROM cash_audit_statements WHERE cash_audit_id = v_audit
    ORDER BY sort_order, uploaded_at
  ) t;
END; $function$;