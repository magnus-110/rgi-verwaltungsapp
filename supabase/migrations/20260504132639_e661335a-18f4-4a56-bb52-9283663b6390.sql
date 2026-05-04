CREATE OR REPLACE FUNCTION public.calculate_account_balance_at(
  p_account_id uuid, p_building_id uuid, p_date date
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN b.account_id = p_account_id         THEN  b.amount
      WHEN b.counter_account_id = p_account_id THEN -b.amount
      ELSE 0
    END
  ), 0)
  FROM public.bookings b
  WHERE b.building_id = p_building_id
    AND b.booking_date <= p_date
    AND COALESCE(b.status, '') <> 'cancelled'
    AND (b.account_id = p_account_id OR b.counter_account_id = p_account_id);
$$;