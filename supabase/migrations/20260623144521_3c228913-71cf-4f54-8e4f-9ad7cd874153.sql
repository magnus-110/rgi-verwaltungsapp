
ALTER TABLE public.time_clock_entries
  ADD COLUMN status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending','approved','rejected')),
  ADD COLUMN reason text,
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz;

-- existing rows: button entries stay approved (default), nothing to do.

-- enforce: pending/rejected only allowed for manual entries
ALTER TABLE public.time_clock_entries
  ADD CONSTRAINT time_clock_status_source_chk
  CHECK (status = 'approved' OR source = 'manual');

-- Only admins may flip status
CREATE OR REPLACE FUNCTION public.time_clock_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- non-admins inserting a manual entry must set pending
    IF NEW.source = 'manual'
       AND NEW.user_id = auth.uid()
       AND public.get_user_role(auth.uid()) <> 'admin'::app_role THEN
      NEW.status := 'pending';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF public.get_user_role(auth.uid()) <> 'admin'::app_role THEN
        RAISE EXCEPTION 'Nur Admins können den Status ändern';
      END IF;
      IF NEW.status IN ('approved','rejected') THEN
        NEW.approved_by := auth.uid();
        NEW.approved_at := now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER time_clock_guard_status_trg
  BEFORE INSERT OR UPDATE ON public.time_clock_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_clock_guard_status();
