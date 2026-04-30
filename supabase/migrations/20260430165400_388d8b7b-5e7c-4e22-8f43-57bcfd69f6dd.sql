-- 1) Add parent_event_id to case_events
ALTER TABLE public.case_events
  ADD COLUMN IF NOT EXISTS parent_event_id uuid REFERENCES public.case_events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_case_events_parent_event_id
  ON public.case_events(parent_event_id);

-- 2) Trigger to enforce max depth = 1
CREATE OR REPLACE FUNCTION public.enforce_case_event_single_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_parent uuid;
BEGIN
  IF NEW.parent_event_id IS NOT NULL THEN
    SELECT parent_event_id INTO parent_parent
    FROM public.case_events
    WHERE id = NEW.parent_event_id;

    IF parent_parent IS NOT NULL THEN
      RAISE EXCEPTION 'case_events: only one nesting level allowed (parent already has a parent)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_case_event_single_level ON public.case_events;
CREATE TRIGGER trg_enforce_case_event_single_level
BEFORE INSERT OR UPDATE OF parent_event_id ON public.case_events
FOR EACH ROW
EXECUTE FUNCTION public.enforce_case_event_single_level();

-- 3) Delete all existing sub-cases (and cascade their events)
DELETE FROM public.case_events
 WHERE case_id IN (SELECT id FROM public.cases WHERE parent_case_id IS NOT NULL);

DELETE FROM public.cases
 WHERE parent_case_id IS NOT NULL;

-- 4) Drop the parent_case_id column entirely
ALTER TABLE public.cases
  DROP COLUMN IF EXISTS parent_case_id;