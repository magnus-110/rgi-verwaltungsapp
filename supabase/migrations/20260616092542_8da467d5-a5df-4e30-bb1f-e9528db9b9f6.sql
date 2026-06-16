
-- Profile -> primary contact_person
CREATE OR REPLACE FUNCTION public.sync_name_profile_to_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_person_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE user_id = NEW.user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_contact_id IS NULL THEN RETURN NEW; END IF;

  -- Update contacts.first_name/last_name too (top-level fields exist)
  UPDATE public.contacts
    SET first_name = NEW.first_name,
        last_name  = NEW.last_name,
        updated_at = now()
  WHERE id = v_contact_id
    AND (first_name IS DISTINCT FROM NEW.first_name OR last_name IS DISTINCT FROM NEW.last_name);

  SELECT id INTO v_person_id
  FROM public.contact_persons
  WHERE contact_id = v_contact_id
  ORDER BY (is_primary IS TRUE) DESC, sort_order NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_person_id IS NOT NULL THEN
    UPDATE public.contact_persons
      SET first_name = NEW.first_name,
          last_name  = NEW.last_name,
          updated_at = now()
    WHERE id = v_person_id
      AND (first_name IS DISTINCT FROM NEW.first_name OR last_name IS DISTINCT FROM NEW.last_name);
  END IF;

  RETURN NEW;
END;
$$;

-- contact_persons -> profile (and contacts top-level)
CREATE OR REPLACE FUNCTION public.sync_name_contact_person_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_primary boolean;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- only sync the primary person of the contact
  SELECT (id = NEW.id) INTO v_is_primary
  FROM public.contact_persons
  WHERE contact_id = NEW.contact_id
  ORDER BY (is_primary IS TRUE) DESC, sort_order NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_is_primary IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT user_id INTO v_user_id FROM public.contacts WHERE id = NEW.contact_id;

  -- Always mirror to contacts top-level
  UPDATE public.contacts
    SET first_name = NEW.first_name,
        last_name  = NEW.last_name,
        updated_at = now()
  WHERE id = NEW.contact_id
    AND (first_name IS DISTINCT FROM NEW.first_name OR last_name IS DISTINCT FROM NEW.last_name);

  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
      SET first_name = NEW.first_name,
          last_name  = NEW.last_name,
          updated_at = now()
    WHERE user_id = v_user_id
      AND (first_name IS DISTINCT FROM NEW.first_name OR last_name IS DISTINCT FROM NEW.last_name);
  END IF;

  RETURN NEW;
END;
$$;

-- contacts top-level name change -> profile + primary person
CREATE OR REPLACE FUNCTION public.sync_name_contact_to_others()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
      SET first_name = NEW.first_name,
          last_name  = NEW.last_name,
          updated_at = now()
    WHERE user_id = NEW.user_id
      AND (first_name IS DISTINCT FROM NEW.first_name OR last_name IS DISTINCT FROM NEW.last_name);
  END IF;

  SELECT id INTO v_person_id
  FROM public.contact_persons
  WHERE contact_id = NEW.id
  ORDER BY (is_primary IS TRUE) DESC, sort_order NULLS LAST, created_at ASC
  LIMIT 1;

  IF v_person_id IS NOT NULL THEN
    UPDATE public.contact_persons
      SET first_name = NEW.first_name,
          last_name  = NEW.last_name,
          updated_at = now()
    WHERE id = v_person_id
      AND (first_name IS DISTINCT FROM NEW.first_name OR last_name IS DISTINCT FROM NEW.last_name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_name_profile_to_contact ON public.profiles;
CREATE TRIGGER trg_sync_name_profile_to_contact
AFTER UPDATE OF first_name, last_name ON public.profiles
FOR EACH ROW
WHEN (OLD.first_name IS DISTINCT FROM NEW.first_name OR OLD.last_name IS DISTINCT FROM NEW.last_name)
EXECUTE FUNCTION public.sync_name_profile_to_contact();

DROP TRIGGER IF EXISTS trg_sync_name_contact_person_to_profile ON public.contact_persons;
CREATE TRIGGER trg_sync_name_contact_person_to_profile
AFTER UPDATE OF first_name, last_name ON public.contact_persons
FOR EACH ROW
WHEN (OLD.first_name IS DISTINCT FROM NEW.first_name OR OLD.last_name IS DISTINCT FROM NEW.last_name)
EXECUTE FUNCTION public.sync_name_contact_person_to_profile();

DROP TRIGGER IF EXISTS trg_sync_name_contact_to_others ON public.contacts;
CREATE TRIGGER trg_sync_name_contact_to_others
AFTER UPDATE OF first_name, last_name ON public.contacts
FOR EACH ROW
WHEN (OLD.first_name IS DISTINCT FROM NEW.first_name OR OLD.last_name IS DISTINCT FROM NEW.last_name)
EXECUTE FUNCTION public.sync_name_contact_to_others();

-- One-off backfill: contact_persons (primary) -> profiles & contacts
WITH primary_persons AS (
  SELECT DISTINCT ON (cp.contact_id)
    cp.contact_id, cp.first_name, cp.last_name
  FROM public.contact_persons cp
  ORDER BY cp.contact_id, (cp.is_primary IS TRUE) DESC, cp.sort_order NULLS LAST, cp.created_at ASC
)
UPDATE public.profiles p
SET first_name = pp.first_name,
    last_name  = pp.last_name,
    updated_at = now()
FROM public.contacts c
JOIN primary_persons pp ON pp.contact_id = c.id
WHERE c.user_id = p.user_id
  AND (p.first_name IS DISTINCT FROM pp.first_name OR p.last_name IS DISTINCT FROM pp.last_name)
  AND (pp.first_name IS NOT NULL OR pp.last_name IS NOT NULL);
