ALTER TABLE public.billing_templates DROP CONSTRAINT IF EXISTS billing_templates_scope_check;

UPDATE public.billing_templates
SET scope = 'economic_plan_overall'
WHERE scope = 'economic_plan';

ALTER TABLE public.billing_templates
  ADD CONSTRAINT billing_templates_scope_check
  CHECK (scope = ANY (ARRAY[
    'overall'::text,
    'single'::text,
    'asset_report'::text,
    'paragraph_35a'::text,
    'economic_plan_overall'::text,
    'economic_plan_single'::text
  ]));