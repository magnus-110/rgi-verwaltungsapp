
-- 1) Columns
ALTER TABLE public.etv_resolutions
  ADD COLUMN IF NOT EXISTS is_actionable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actionable_status text NOT NULL DEFAULT 'open'
    CHECK (actionable_status IN ('open','in_progress','completed'));

CREATE INDEX IF NOT EXISTS idx_etv_resolutions_actionable
  ON public.etv_resolutions (building_id, is_actionable, actionable_status)
  WHERE is_actionable = true;

-- 2) Function: when marking actionable, create a case if none exists
CREATE OR REPLACE FUNCTION public.handle_resolution_actionable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_id uuid;
  v_title text;
  v_uid uuid;
BEGIN
  v_uid := COALESCE(auth.uid(), NEW.created_by);

  -- Newly toggled ON and no case yet
  IF NEW.is_actionable = true AND (OLD IS NULL OR OLD.is_actionable = false) AND NEW.case_id IS NULL THEN
    v_title := COALESCE(NEW.resolution_number, 'Beschluss') || ': ' ||
               LEFT(COALESCE(NEW.resolution_text, 'Beschlussumsetzung'), 120);

    INSERT INTO public.cases (
      building_id, management_mode, title, description,
      category, status, priority, created_by
    ) VALUES (
      NEW.building_id,
      'weg',
      v_title,
      'Automatisch aus Beschluss ' || COALESCE(NEW.resolution_number, '') || ' erstellt.' || E'\n\n' || COALESCE(NEW.resolution_text, ''),
      'instandhaltung',
      'open',
      'medium',
      v_uid
    )
    RETURNING id INTO v_case_id;

    NEW.case_id := v_case_id;
    NEW.actionable_status := 'open';
  END IF;

  -- Toggled OFF: archive linked case (if any) and reset status
  IF NEW.is_actionable = false AND OLD IS NOT NULL AND OLD.is_actionable = true THEN
    IF OLD.case_id IS NOT NULL THEN
      UPDATE public.cases
        SET status = 'archived', closed_at = COALESCE(closed_at, now())
        WHERE id = OLD.case_id AND status <> 'archived';
    END IF;
    NEW.actionable_status := 'open';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolution_actionable ON public.etv_resolutions;
CREATE TRIGGER trg_resolution_actionable
BEFORE INSERT OR UPDATE OF is_actionable ON public.etv_resolutions
FOR EACH ROW EXECUTE FUNCTION public.handle_resolution_actionable();

-- 3) Function: mirror case status back to resolution.actionable_status
CREATE OR REPLACE FUNCTION public.sync_case_status_to_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.status IN ('resolved','archived') THEN
    v_status := 'completed';
  ELSIF NEW.status = 'in_progress' THEN
    v_status := 'in_progress';
  ELSE
    v_status := 'open';
  END IF;

  UPDATE public.etv_resolutions
    SET actionable_status = v_status
    WHERE case_id = NEW.id AND is_actionable = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_case_status_to_resolution ON public.cases;
CREATE TRIGGER trg_case_status_to_resolution
AFTER UPDATE OF status ON public.cases
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_case_status_to_resolution();
