-- Rechnungsnummern auch für den Claude-Konnektor (rgi-connector, läuft mit dem Service-Schlüssel).
-- Bisher durfte nur ein angemeldeter Admin eine Nummer ziehen; der Konnektor hat keinen Nutzer
-- (auth.uid() ist leer). Der Service-Schlüssel ist nur serverseitig vorhanden, daher unbedenklich.
CREATE OR REPLACE FUNCTION public.rgi_next_invoice_number(p_sparte rgi_sparte DEFAULT NULL::rgi_sparte)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern TEXT;
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  v_month TEXT := lpad(EXTRACT(MONTH FROM CURRENT_DATE)::TEXT, 2, '0');
  v_scope TEXT;
  v_last INTEGER;
  v_no_str TEXT;
  v_result TEXT;
BEGIN
  IF NOT (public.rgi_is_admin(auth.uid()) OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT invoice_number_pattern INTO v_pattern FROM public.rgi_company_settings LIMIT 1;
  IF v_pattern IS NULL THEN v_pattern := '{YYYY}-{NNNN}'; END IF;
  v_scope := COALESCE(p_sparte::TEXT, 'default');
  IF position('{SPARTE}' in v_pattern) = 0 THEN v_scope := 'default'; END IF;
  INSERT INTO public.rgi_invoice_sequences (scope, year, last_no)
  VALUES (v_scope, v_year, 1)
  ON CONFLICT (scope, year) DO UPDATE SET last_no = public.rgi_invoice_sequences.last_no + 1
  RETURNING last_no INTO v_last;
  v_no_str := lpad(v_last::TEXT, 4, '0');
  v_result := v_pattern;
  v_result := replace(v_result, '{YYYY}', v_year::TEXT);
  v_result := replace(v_result, '{MM}', v_month);
  v_result := replace(v_result, '{SPARTE}', upper(v_scope));
  v_result := replace(v_result, '{NNNN}', v_no_str);
  RETURN v_result;
END;
$function$;
