
-- 1) is_default-Flag pro Vorlage + Eindeutigkeit pro Scope
ALTER TABLE public.billing_templates
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Eindeutigkeit: höchstens eine Default-Vorlage pro scope
CREATE UNIQUE INDEX IF NOT EXISTS billing_templates_one_default_per_scope
  ON public.billing_templates (scope)
  WHERE is_default = TRUE;

-- Trigger: Beim Setzen von is_default=true alle anderen im selben Scope auf false
CREATE OR REPLACE FUNCTION public.billing_templates_enforce_single_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default IS TRUE THEN
    UPDATE public.billing_templates
       SET is_default = FALSE
     WHERE scope = NEW.scope
       AND id <> NEW.id
       AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_templates_single_default ON public.billing_templates;
CREATE TRIGGER trg_billing_templates_single_default
BEFORE INSERT OR UPDATE OF is_default ON public.billing_templates
FOR EACH ROW
EXECUTE FUNCTION public.billing_templates_enforce_single_default();

-- 2) Backfill: pro scope die neueste vorhandene Vorlage als default setzen,
--    falls noch keine default existiert
WITH ranked AS (
  SELECT id, scope,
         ROW_NUMBER() OVER (PARTITION BY scope ORDER BY created_at DESC, id) AS rn
    FROM public.billing_templates
), to_default AS (
  SELECT r.id, r.scope
    FROM ranked r
   WHERE r.rn = 1
     AND NOT EXISTS (
       SELECT 1 FROM public.billing_templates t2
        WHERE t2.scope = r.scope AND t2.is_default = TRUE
     )
)
UPDATE public.billing_templates t
   SET is_default = TRUE
  FROM to_default d
 WHERE t.id = d.id;
