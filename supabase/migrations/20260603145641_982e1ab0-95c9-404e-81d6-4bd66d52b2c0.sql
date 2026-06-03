CREATE OR REPLACE FUNCTION public.get_audit_bank_statement_pdfs_by_token(p_token text)
 RETURNS SETOF json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_building uuid;
  v_year integer;
BEGIN
  SELECT building_id, fiscal_year INTO v_building, v_year
  FROM cash_audits WHERE access_token = p_token LIMIT 1;
  IF v_building IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT row_to_json(t) FROM (
    SELECT id, file_name, file_path, created_at AS uploaded_at,
           statement_date_from, statement_date_to
    FROM bank_statements
    WHERE building_id = v_building
      AND fiscal_year = v_year
      AND source_format = 'pdf'
      AND file_path IS NOT NULL
    ORDER BY statement_date_from NULLS LAST, created_at
  ) t;
END; $function$;

GRANT EXECUTE ON FUNCTION public.get_audit_bank_statement_pdfs_by_token(text) TO anon, authenticated;