-- SECURITY DEFINER RPCs for cash audit token-based access
-- Allow auditors with a valid token to read bookings/COA/balances/statements/invoices for the audited building+year only.

CREATE OR REPLACE FUNCTION public.get_audit_bookings_by_token(p_token text)
RETURNS SETOF json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_audit RECORD;
BEGIN
  SELECT building_id, fiscal_year INTO v_audit
  FROM cash_audits WHERE access_token = p_token LIMIT 1;
  IF v_audit IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT row_to_json(t) FROM (
    SELECT
      b.id, b.booking_date, b.description, b.amount, b.booking_type,
      b.receipt_number, b.account_id, b.counter_account_id,
      b.invoice_id, b.matched_template_id, b.needs_review, b.review_note,
      b.status,
      json_build_object(
        'account_number', coa.account_number,
        'account_name', coa.account_name
      ) AS chart_of_accounts,
      CASE WHEN b.invoice_id IS NOT NULL THEN
        json_build_object(
          'id', i.id, 'vendor_name', i.vendor_name, 'file_path', i.file_path,
          'gross_amount', i.gross_amount, 'invoice_number', i.invoice_number
        ) END AS invoices,
      CASE WHEN b.matched_template_id IS NOT NULL THEN
        json_build_object(
          'id', bt.id, 'name', bt.name, 'expected_amount', bt.expected_amount,
          'interval', bt.interval, 'vendor_name', bt.vendor_name,
          'linked_invoice_id', bt.linked_invoice_id
        ) END AS booking_templates
    FROM bookings b
    LEFT JOIN chart_of_accounts coa ON coa.id = b.account_id
    LEFT JOIN invoices i ON i.id = b.invoice_id
    LEFT JOIN booking_templates bt ON bt.id = b.matched_template_id
    WHERE b.building_id = v_audit.building_id
      AND b.fiscal_year = v_audit.fiscal_year
      AND b.status IN ('pending','confirmed')
    ORDER BY b.booking_date
  ) t;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_audit_accounts_by_token(p_token text)
RETURNS SETOF json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_audit RECORD;
BEGIN
  SELECT building_id INTO v_audit FROM cash_audits WHERE access_token = p_token LIMIT 1;
  IF v_audit IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT row_to_json(t) FROM (
    SELECT id, account_number, account_name, category, sort_order, building_id, is_billing_relevant
    FROM chart_of_accounts
    WHERE building_id = v_audit.building_id OR building_id IS NULL
    ORDER BY account_number
  ) t;
END; $$;

CREATE OR REPLACE FUNCTION public.get_audit_balances_by_token(p_token text)
RETURNS SETOF json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_audit RECORD;
BEGIN
  SELECT building_id, fiscal_year INTO v_audit FROM cash_audits WHERE access_token = p_token LIMIT 1;
  IF v_audit IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT row_to_json(t) FROM (
    SELECT account_id, opening_balance, closing_balance, building_id
    FROM account_balances
    WHERE building_id = v_audit.building_id AND fiscal_year = v_audit.fiscal_year
  ) t;
END; $$;

CREATE OR REPLACE FUNCTION public.get_audit_statements_by_token(p_token text)
RETURNS SETOF json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_audit RECORD;
BEGIN
  SELECT building_id INTO v_audit FROM cash_audits WHERE access_token = p_token LIMIT 1;
  IF v_audit IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT row_to_json(t) FROM (
    SELECT id, file_name, file_path, import_date, statement_date_from, statement_date_to
    FROM bank_statements
    WHERE building_id = v_audit.building_id
    ORDER BY statement_date_from DESC NULLS LAST
  ) t;
END; $$;

CREATE OR REPLACE FUNCTION public.get_audit_invoices_by_token(p_token text)
RETURNS SETOF json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_audit RECORD;
BEGIN
  SELECT building_id, fiscal_year INTO v_audit FROM cash_audits WHERE access_token = p_token LIMIT 1;
  IF v_audit IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT row_to_json(t) FROM (
    SELECT id, vendor_name, invoice_number, gross_amount, file_path, invoice_date
    FROM invoices
    WHERE building_id = v_audit.building_id
      AND invoice_date >= make_date(v_audit.fiscal_year, 1, 1)
      AND invoice_date <= make_date(v_audit.fiscal_year, 12, 31)
    ORDER BY invoice_date
  ) t;
END; $$;

-- Signed URL helper would require storage extension; keep on client via existing endpoint.
GRANT EXECUTE ON FUNCTION public.get_audit_bookings_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_accounts_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_balances_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_statements_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_invoices_by_token(text) TO anon, authenticated;