-- Erweitere scope um asset_report
DO $$
DECLARE conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  WHERE c.conrelid = 'public.billing_templates'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%scope%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.billing_templates DROP CONSTRAINT %I', conname);
  END IF;
END$$;

ALTER TABLE public.billing_templates
  ADD CONSTRAINT billing_templates_scope_check
  CHECK (scope IN ('overall', 'single', 'asset_report'));