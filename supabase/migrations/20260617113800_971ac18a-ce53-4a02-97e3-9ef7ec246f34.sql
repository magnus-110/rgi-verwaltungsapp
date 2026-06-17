
ALTER TABLE public.billing_templates DROP CONSTRAINT IF EXISTS billing_templates_scope_check;
ALTER TABLE public.billing_templates ADD CONSTRAINT billing_templates_scope_check
  CHECK (scope = ANY (ARRAY[
    'overall','single','asset_report','paragraph_35a',
    'economic_plan_overall','economic_plan_single','combined_report',
    'service_nebenkosten','service_anlage_v','service_mietvertrag'
  ]));
