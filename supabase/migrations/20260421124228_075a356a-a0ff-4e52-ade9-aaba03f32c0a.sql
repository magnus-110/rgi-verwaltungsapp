-- Unified ledger view: each booking yields two lines (main + counter)
CREATE OR REPLACE VIEW public.v_account_movements
WITH (security_invoker = true)
AS
SELECT
  b.id              AS booking_id,
  b.building_id,
  b.fiscal_year,
  b.booking_date,
  b.account_id,
  b.amount          AS amount,
  'main'::text      AS side,
  b.description,
  b.receipt_number,
  b.status,
  b.source,
  b.booking_category,
  b.is_35a_relevant,
  b.amount_35a
FROM public.bookings b
WHERE b.account_id IS NOT NULL
  AND b.status <> 'cancelled'

UNION ALL

SELECT
  b.id              AS booking_id,
  b.building_id,
  b.fiscal_year,
  b.booking_date,
  b.counter_account_id AS account_id,
  -b.amount         AS amount,
  'counter'::text   AS side,
  b.description,
  b.receipt_number,
  b.status,
  b.source,
  b.booking_category,
  b.is_35a_relevant,
  b.amount_35a
FROM public.bookings b
WHERE b.counter_account_id IS NOT NULL
  AND b.status <> 'cancelled';

COMMENT ON VIEW public.v_account_movements IS
  'Unified ledger: splits each booking into main (+amount) and counter (-amount) lines so any account_id query returns all relevant movements regardless of bank-centric booking direction.';

GRANT SELECT ON public.v_account_movements TO authenticated;