
CREATE OR REPLACE FUNCTION public.time_clock_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean := public.get_user_role(auth.uid()) = 'admin'::app_role;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'manual' AND NEW.user_id = auth.uid() AND NOT is_admin THEN
      NEW.status := 'pending';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Non-admin editing their own times -> back to pending
    IF NOT is_admin
       AND NEW.user_id = auth.uid()
       AND (NEW.started_at IS DISTINCT FROM OLD.started_at
            OR NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
      NEW.status := 'pending';
      NEW.source := 'manual';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
      NEW.edited_by := auth.uid();
      NEW.edited_at := now();
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT is_admin THEN
        -- allow the auto-transition to pending we just did above
        IF NEW.status <> 'pending' THEN
          RAISE EXCEPTION 'Nur Admins können den Status ändern';
        END IF;
      ELSE
        IF NEW.status IN ('approved','rejected') THEN
          NEW.approved_by := auth.uid();
          NEW.approved_at := now();
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
