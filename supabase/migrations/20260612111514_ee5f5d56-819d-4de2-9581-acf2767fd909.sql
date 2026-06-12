
-- Validation trigger for tenant assignment periods
CREATE OR REPLACE FUNCTION public.validate_tenant_assignment_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.valid_from IS NOT NULL AND NEW.valid_to IS NOT NULL THEN
    IF NEW.valid_to < NEW.valid_from THEN
      RAISE EXCEPTION 'Auszug (valid_to %) darf nicht vor Einzug (valid_from %) liegen', NEW.valid_to, NEW.valid_from;
    END IF;
  END IF;

  IF NEW.role_in_building = 'mieter' AND NEW.building_id IS NOT NULL AND NEW.unit_number IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.contact_building_assignments other
      WHERE other.id <> NEW.id
        AND other.building_id = NEW.building_id
        AND other.unit_number = NEW.unit_number
        AND other.role_in_building = 'mieter'
        AND COALESCE(other.valid_from, '0001-01-01'::date) <= COALESCE(NEW.valid_to, '9999-12-31'::date)
        AND COALESCE(other.valid_to, '9999-12-31'::date) >= COALESCE(NEW.valid_from, '0001-01-01'::date)
    ) THEN
      RAISE EXCEPTION 'Überlappender Mieter-Zeitraum für Einheit % in dieser Liegenschaft', NEW.unit_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tenant_assignment_period ON public.contact_building_assignments;
CREATE TRIGGER trg_validate_tenant_assignment_period
BEFORE INSERT OR UPDATE ON public.contact_building_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_assignment_period();
