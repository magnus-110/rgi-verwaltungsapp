-- Nebeneinheiten (Stellplätze, Keller, Hobbyräume, Gartenanteile)
-- 1. Enums
CREATE TYPE public.unit_kind AS ENUM (
  'apartment',
  'parking_garage',
  'parking_outdoor',
  'cellar',
  'hobby_room',
  'garden',
  'other'
);

CREATE TYPE public.billing_mode AS ENUM (
  'own_billing',
  'distribution_only'
);

-- 2. Spalten an contact_building_assignments
ALTER TABLE public.contact_building_assignments
  ADD COLUMN unit_kind public.unit_kind NOT NULL DEFAULT 'apartment',
  ADD COLUMN billing_mode public.billing_mode NOT NULL DEFAULT 'own_billing',
  ADD COLUMN parent_assignment_id uuid NULL
    REFERENCES public.contact_building_assignments(id) ON DELETE SET NULL;

CREATE INDEX idx_cba_parent_assignment ON public.contact_building_assignments(parent_assignment_id);
CREATE INDEX idx_cba_unit_kind ON public.contact_building_assignments(unit_kind);
CREATE INDEX idx_cba_billing_mode ON public.contact_building_assignments(billing_mode);

-- 3. Validierungs-Trigger:
--    distribution_only ist nur erlaubt, wenn derselbe Contact im selben Building
--    mindestens ein weiteres Assignment mit billing_mode='own_billing' (i.d.R. die Wohnung) hat
--    ODER ein parent_assignment_id gesetzt ist, das own_billing ist.
CREATE OR REPLACE FUNCTION public.validate_distribution_only_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_owner_unit boolean;
  v_parent_mode public.billing_mode;
BEGIN
  IF NEW.billing_mode <> 'distribution_only' THEN
    RETURN NEW;
  END IF;

  -- Wenn Parent gesetzt: Parent muss own_billing sein
  IF NEW.parent_assignment_id IS NOT NULL THEN
    SELECT billing_mode INTO v_parent_mode
    FROM public.contact_building_assignments
    WHERE id = NEW.parent_assignment_id;
    IF v_parent_mode = 'own_billing' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Sonst: irgendein anderes own_billing-Assignment desselben Contacts im selben Building?
  SELECT EXISTS (
    SELECT 1 FROM public.contact_building_assignments
    WHERE contact_id = NEW.contact_id
      AND building_id = NEW.building_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND billing_mode = 'own_billing'
      AND is_active = true
  ) INTO v_has_owner_unit;

  IF NOT v_has_owner_unit THEN
    RAISE EXCEPTION 'Eine Nebeneinheit im Modus "Nur Verteilung" benötigt eine Hauptwohnung (own_billing) desselben Eigentümers im gleichen Gebäude oder ein Parent-Assignment.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_distribution_only
  BEFORE INSERT OR UPDATE ON public.contact_building_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_distribution_only_assignment();

COMMENT ON COLUMN public.contact_building_assignments.unit_kind IS
  'Art der Einheit: Wohnung, TG-Stellplatz, Außenstellplatz, Keller, Hobbyraum, Garten, Sonstige.';
COMMENT ON COLUMN public.contact_building_assignments.billing_mode IS
  'own_billing: eigene Abrechnung + Hausgeld + eigene Position. distribution_only: MEA fließt zur Hauptwohnung des Eigentümers, keine eigene Abrechnungszeile.';
COMMENT ON COLUMN public.contact_building_assignments.parent_assignment_id IS
  'Optional: Verknüpfung einer Nebeneinheit mit der Hauptwohnung desselben Eigentümers.';