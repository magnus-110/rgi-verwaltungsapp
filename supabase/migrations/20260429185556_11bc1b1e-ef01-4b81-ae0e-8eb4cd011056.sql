
-- Sub-Vorgänge: parent_case_id Spalte
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS parent_case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_parent_case_id ON public.cases(parent_case_id);

-- Trigger: Bei Anlage eines Sub-Vorgangs Event im Parent erzeugen
CREATE OR REPLACE FUNCTION public.handle_subcase_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_case_id IS NOT NULL THEN
    INSERT INTO public.case_events (case_id, building_id, event_type, title, body, source_table, source_id, created_by)
    VALUES (NEW.parent_case_id, NEW.building_id, 'note', 'Teilvorgang erstellt', NEW.title, 'cases', NEW.id, NEW.created_by);
    UPDATE public.cases SET updated_at = now() WHERE id = NEW.parent_case_id;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.parent_case_id IS NOT NULL
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.case_events (case_id, building_id, event_type, title, body, source_table, source_id, created_by)
    VALUES (
      NEW.parent_case_id,
      NEW.building_id,
      'status_change',
      'Teilvorgang Status: ' || NEW.status,
      NEW.title,
      'cases',
      NEW.id,
      COALESCE(NEW.created_by, OLD.created_by)
    );
    UPDATE public.cases SET updated_at = now() WHERE id = NEW.parent_case_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subcase_lifecycle ON public.cases;
CREATE TRIGGER trg_subcase_lifecycle
AFTER INSERT OR UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION public.handle_subcase_lifecycle();
