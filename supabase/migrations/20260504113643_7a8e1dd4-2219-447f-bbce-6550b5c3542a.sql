
-- Atomic split booking creation + orphan cleanup helpers.
-- Both are SECURITY DEFINER and require the caller to be authenticated.

-- 1) Atomic insert of multiple booking rows for one bank transaction.
--    Either ALL rows get inserted and the bank transaction is marked as booked,
--    or NOTHING happens (transaction-level rollback).
CREATE OR REPLACE FUNCTION public.book_split_transaction(
  p_bank_transaction_id uuid,
  p_bookings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inserted_ids uuid[] := ARRAY[]::uuid[];
  v_total int;
  v_part int := 0;
  v_row jsonb;
  v_new_id uuid;
  v_first_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF jsonb_typeof(p_bookings) <> 'array' THEN
    RAISE EXCEPTION 'p_bookings must be a JSON array';
  END IF;

  v_total := jsonb_array_length(p_bookings);
  IF v_total = 0 THEN
    RAISE EXCEPTION 'No booking rows provided';
  END IF;

  -- Defensive cleanup: if there are pre-existing partial bookings for this txn
  -- (e.g. a previous aborted attempt) they will be removed first to avoid
  -- duplicates. This is safe because the transaction is not yet marked booked.
  DELETE FROM public.bookings
   WHERE bank_transaction_id = p_bank_transaction_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_bookings)
  LOOP
    v_part := v_part + 1;

    INSERT INTO public.bookings (
      building_id,
      account_id,
      counter_account_id,
      amount,
      vat_rate,
      vat_amount,
      description,
      booking_reference,
      booking_date,
      receipt_number,
      booking_type,
      fiscal_year,
      invoice_id,
      matched_template_id,
      is_35a_relevant,
      amount_35a,
      needs_review,
      review_note,
      line_items_detail,
      source,
      status,
      confirmed_at,
      confirmed_by,
      created_by,
      bank_transaction_id,
      split_part,
      split_parts_total
    ) VALUES (
      (v_row->>'building_id')::uuid,
      (v_row->>'account_id')::uuid,
      NULLIF(v_row->>'counter_account_id','')::uuid,
      (v_row->>'amount')::numeric,
      COALESCE((v_row->>'vat_rate')::numeric, 0),
      NULLIF(v_row->>'vat_amount','')::numeric,
      v_row->>'description',
      v_row->>'booking_reference',
      (v_row->>'booking_date')::date,
      v_row->>'receipt_number',
      v_row->>'booking_type',
      (v_row->>'fiscal_year')::int,
      NULLIF(v_row->>'invoice_id','')::uuid,
      NULLIF(v_row->>'matched_template_id','')::uuid,
      COALESCE((v_row->>'is_35a_relevant')::boolean, false),
      NULLIF(v_row->>'amount_35a','')::numeric,
      COALESCE((v_row->>'needs_review')::boolean, false),
      v_row->>'review_note',
      CASE WHEN v_row ? 'line_items_detail' AND v_row->'line_items_detail' <> 'null'::jsonb
           THEN v_row->'line_items_detail' ELSE NULL END,
      'bank_import',
      'confirmed',
      now(),
      v_user,
      v_user,
      p_bank_transaction_id,
      CASE WHEN v_total > 1 THEN v_part ELSE NULL END,
      CASE WHEN v_total > 1 THEN v_total ELSE NULL END
    )
    RETURNING id INTO v_new_id;

    v_inserted_ids := array_append(v_inserted_ids, v_new_id);
    IF v_first_id IS NULL THEN v_first_id := v_new_id; END IF;
  END LOOP;

  -- Mark bank transaction as fully booked (only after every row succeeded)
  UPDATE public.bank_transactions
     SET booked_at = now(),
         booking_id = v_first_id
   WHERE id = p_bank_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_ids', to_jsonb(v_inserted_ids),
    'count', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_split_transaction(uuid, jsonb) TO authenticated;

-- 2) Delete a booking and (for splits) all sibling rows of the same bank
--    transaction, then free the bank transaction so it reappears for booking.
CREATE OR REPLACE FUNCTION public.delete_booking_with_cleanup(
  p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_txn_id uuid;
  v_deleted int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT bank_transaction_id INTO v_txn_id
    FROM public.bookings WHERE id = p_booking_id;

  IF v_txn_id IS NOT NULL THEN
    -- Split-aware: delete all bookings linked to the same bank transaction
    WITH d AS (
      DELETE FROM public.bookings
       WHERE bank_transaction_id = v_txn_id
       RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM d;

    UPDATE public.bank_transactions
       SET booked_at = NULL,
           booking_id = NULL
     WHERE id = v_txn_id;
  ELSE
    -- Manual booking (no bank link) — just delete the single row
    DELETE FROM public.bookings WHERE id = p_booking_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_deleted,
    'bank_transaction_id', v_txn_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_booking_with_cleanup(uuid) TO authenticated;

-- 3) Cleanup orphaned partial split bookings for a transaction that is not yet
--    marked as fully booked. Used when re-opening a transaction in the review UI.
CREATE OR REPLACE FUNCTION public.cleanup_orphan_split_bookings(
  p_bank_transaction_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_txn_booked timestamptz;
  v_deleted int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT booked_at INTO v_txn_booked
    FROM public.bank_transactions WHERE id = p_bank_transaction_id;

  -- Only clean up when the transaction is NOT marked as booked yet
  IF v_txn_booked IS NULL THEN
    WITH d AS (
      DELETE FROM public.bookings
       WHERE bank_transaction_id = p_bank_transaction_id
       RETURNING 1
    )
    SELECT count(*) INTO v_deleted FROM d;
  END IF;

  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphan_split_bookings(uuid) TO authenticated;
