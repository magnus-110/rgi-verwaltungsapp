-- 1. Delete 6 faulty bookings that reference accounts from wrong buildings
DELETE FROM bookings WHERE id IN (
  '9c198285-eeac-4aac-95c6-2e5ed8ace79d',
  'bb2cf315-6efa-4176-b063-7ae7d12cb1a9',
  '5e83432a-251c-4963-b09d-f42eff7aeeb4',
  '89161692-45a3-4968-8d3e-8479249f09a8',
  '0cc7d86e-bbdd-4a03-92cd-a118b27c0fcb',
  '9cd2b328-c3ba-4a1a-865f-9216bab58ef9'
);

-- 2. Create trigger function to enforce account-building separation
CREATE OR REPLACE FUNCTION public.check_booking_account_building()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check account_id belongs to same building (or is global)
  IF NEW.account_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.chart_of_accounts
      WHERE id = NEW.account_id
        AND building_id IS NOT NULL
        AND building_id != NEW.building_id
    ) THEN
      RAISE EXCEPTION 'Booking account_id (%) belongs to a different building than the booking', NEW.account_id;
    END IF;
  END IF;
  -- Check counter_account_id belongs to same building (or is global)
  IF NEW.counter_account_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.chart_of_accounts
      WHERE id = NEW.counter_account_id
        AND building_id IS NOT NULL
        AND building_id != NEW.building_id
    ) THEN
      RAISE EXCEPTION 'Booking counter_account_id (%) belongs to a different building than the booking', NEW.counter_account_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Create trigger
CREATE TRIGGER trg_check_booking_account_building
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_booking_account_building();