
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET mfa_required = true WHERE role IN ('admin','employee');

CREATE OR REPLACE FUNCTION public.sync_mfa_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.mfa_required := (NEW.role IN ('admin','employee'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mfa_required ON public.profiles;
CREATE TRIGGER trg_sync_mfa_required
BEFORE INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_mfa_required();
