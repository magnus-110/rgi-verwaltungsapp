
-- Multi-unit support: per-assignment personal data overrides + onboarding flag
ALTER TABLE public.contact_building_assignments
  ADD COLUMN IF NOT EXISTS salutation_override text,
  ADD COLUMN IF NOT EXISTS first_name_override text,
  ADD COLUMN IF NOT EXISTS last_name_override text,
  ADD COLUMN IF NOT EXISTS company_name_override text;

ALTER TABLE public.onboarding_progress
  ADD COLUMN IF NOT EXISTS applies_to_all_assignments boolean NOT NULL DEFAULT false;

-- Notify on IBAN override change at assignment level (best-effort, mirrors existing IBAN-change pattern)
CREATE OR REPLACE FUNCTION public.notify_iban_override_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.iban_override,'') = COALESCE(OLD.iban_override,'') THEN
    RETURN NEW;
  END IF;
  IF NEW.iban_override IS NOT NULL AND length(trim(NEW.iban_override)) > 0 THEN
    INSERT INTO public.iban_change_notifications (contact_id, building_id, new_iban, source, created_at)
    VALUES (NEW.contact_id, NEW.building_id, NEW.iban_override, 'assignment_override', now())
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN undefined_table THEN
  -- notification table not present yet; ignore
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_iban_override_change ON public.contact_building_assignments;
CREATE TRIGGER trg_notify_iban_override_change
AFTER INSERT OR UPDATE OF iban_override ON public.contact_building_assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_iban_override_change();
