-- One-off backfill: populate vendor_memory from existing booking_embeddings
DO $$
DECLARE
  r record;
  v_iban text;
  v_name_norm text;
BEGIN
  FOR r IN
    SELECT 
      be.creditor_name,
      bt.creditor_iban,
      be.purpose_text,
      be.management_mode,
      be.counter_account_number,
      coa.category AS account_category,
      be.is_35a_relevant
    FROM public.booking_embeddings be
    LEFT JOIN public.bookings b ON b.id = be.booking_id
    LEFT JOIN public.bank_transactions bt ON bt.id = b.bank_transaction_id
    LEFT JOIN public.chart_of_accounts coa 
      ON coa.account_number = be.counter_account_number
     AND coa.building_id = be.building_id
    WHERE be.counter_account_number IS NOT NULL
      AND be.creditor_name IS NOT NULL
      AND length(trim(be.creditor_name)) > 0
      AND be.management_mode IS NOT NULL
  LOOP
    v_iban := NULLIF(trim(COALESCE(r.creditor_iban, '')), '');
    v_name_norm := lower(regexp_replace(r.creditor_name, '[^a-zA-Z0-9]', '', 'g'));
    IF length(v_name_norm) = 0 THEN CONTINUE; END IF;

    PERFORM public.vendor_memory_upsert(
      v_iban,
      v_name_norm,
      r.management_mode,
      r.counter_account_number,
      r.account_category,
      LEFT(COALESCE(r.purpose_text, ''), 200),
      COALESCE(r.is_35a_relevant, false)
    );
  END LOOP;
END $$;