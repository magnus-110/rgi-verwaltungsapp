CREATE OR REPLACE FUNCTION public.prevent_mirror_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.account_id IS NULL OR NEW.counter_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE building_id = NEW.building_id
      AND booking_date = NEW.booking_date
      AND amount = NEW.amount
      AND account_id = NEW.counter_account_id
      AND counter_account_id = NEW.account_id
      AND COALESCE(description,'') = COALESCE(NEW.description,'')
      AND booking_type <> NEW.booking_type
  ) THEN
    RAISE EXCEPTION 'Spiegelbuchung erkannt: Vorgang existiert bereits mit vertauschten Konten (date=%, amount=%, desc=%)',
      NEW.booking_date, NEW.amount, NEW.description;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_mirror_booking ON public.bookings;
CREATE TRIGGER trg_prevent_mirror_booking
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mirror_booking();