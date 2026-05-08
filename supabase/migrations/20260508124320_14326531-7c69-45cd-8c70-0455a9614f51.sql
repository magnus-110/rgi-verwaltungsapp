-- 1) Daten bereinigen: 18 falsch verknüpfte Buchungen von der RGI-Firmenrechnung lösen
UPDATE public.bookings
SET invoice_id = NULL
WHERE invoice_id = 'f3541eb6-0848-4675-aa9f-c7cf04ff0ff1';

-- 2) Schutz-Trigger: verhindert, dass eine Buchung mit einer Rechnung verknüpft wird,
--    die einem anderen Gebäude zugeordnet ist oder eine reine Firmenrechnung ist.
CREATE OR REPLACE FUNCTION public.check_booking_invoice_building()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  inv_building uuid;
  inv_is_company boolean;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT building_id, COALESCE(is_company_invoice, false)
    INTO inv_building, inv_is_company
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  -- Firmenrechnung (RGI-intern) darf nicht an Gebäude-Buchungen hängen
  IF inv_is_company AND NEW.building_id IS NOT NULL THEN
    RAISE EXCEPTION 'Buchung kann nicht mit Firmenrechnung (is_company_invoice=true, invoice_id=%) verknüpft werden, da die Buchung einem Gebäude zugeordnet ist.', NEW.invoice_id;
  END IF;

  -- Rechnung mit explizitem Gebäude muss zum Gebäude der Buchung passen
  IF inv_building IS NOT NULL
     AND NEW.building_id IS NOT NULL
     AND inv_building <> NEW.building_id THEN
    RAISE EXCEPTION 'Rechnung % gehört zu Gebäude %, Buchung jedoch zu Gebäude % – Verknüpfung nicht erlaubt.', NEW.invoice_id, inv_building, NEW.building_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_booking_invoice_building ON public.bookings;
CREATE TRIGGER trg_check_booking_invoice_building
BEFORE INSERT OR UPDATE OF invoice_id, building_id ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.check_booking_invoice_building();