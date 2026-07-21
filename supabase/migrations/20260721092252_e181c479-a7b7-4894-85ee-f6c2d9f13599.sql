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
      b.status, b.amount_35a, b.is_35a_relevant,
      json_build_object(
        'account_number', coa.account_number,
        'account_name', coa.account_name
      ) AS chart_of_accounts,
      CASE WHEN b.counter_account_id IS NOT NULL THEN
        json_build_object(
          'account_number', cca.account_number,
          'account_name', cca.account_name
        ) END AS counter_account,
      CASE WHEN b.invoice_id IS NOT NULL THEN
        json_build_object(
          'id', i.id, 'vendor_name', i.vendor_name, 'file_path', i.file_path,
          'gross_amount', i.gross_amount, 'invoice_number', i.invoice_number
        ) END AS invoices,
      CASE WHEN b.matched_template_id IS NOT NULL THEN
        json_build_object(
          'id', bt.id, 'name', bt.name, 'expected_amount', bt.expected_amount,
          'interval', bt.interval, 'vendor_name', bt.vendor_name,
          'linked_invoice_id', bt.linked_invoice_id,
          'linked_invoice',
            CASE WHEN li.id IS NOT NULL AND li.building_id = v_audit.building_id THEN
              json_build_object(
                'id', li.id, 'vendor_name', li.vendor_name, 'file_path', li.file_path,
                'gross_amount', li.gross_amount, 'invoice_number', li.invoice_number
              ) END
        ) END AS booking_templates
    FROM bookings b
    LEFT JOIN chart_of_accounts coa ON coa.id = b.account_id
    LEFT JOIN chart_of_accounts cca ON cca.id = b.counter_account_id
    LEFT JOIN invoices i ON i.id = b.invoice_id
    LEFT JOIN booking_templates bt ON bt.id = b.matched_template_id
    LEFT JOIN invoices li ON li.id = bt.linked_invoice_id
    WHERE b.building_id = v_audit.building_id
      AND b.fiscal_year = v_audit.fiscal_year
      AND b.status IN ('pending','confirmed')
    ORDER BY b.booking_date
  ) t;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_bookings_by_token(text) TO anon, authenticated;