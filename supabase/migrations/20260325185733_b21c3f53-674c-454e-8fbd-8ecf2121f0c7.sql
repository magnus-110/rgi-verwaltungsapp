
-- Economic Plans
CREATE TABLE public.economic_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  based_on_period_id UUID REFERENCES public.billing_periods(id),
  total_costs NUMERIC DEFAULT 0,
  total_reserve NUMERIC DEFAULT 0,
  adjustments JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(building_id, fiscal_year)
);

ALTER TABLE public.economic_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage economic_plans"
  ON public.economic_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Economic Plan Items
CREATE TABLE public.economic_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.economic_plans(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.chart_of_accounts(id),
  previous_amount NUMERIC DEFAULT 0,
  planned_amount NUMERIC DEFAULT 0,
  adjustment_reason TEXT,
  distribution_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.economic_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage economic_plan_items"
  ON public.economic_plan_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_economic_plans_updated_at BEFORE UPDATE ON public.economic_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_economic_plan_items_updated_at BEFORE UPDATE ON public.economic_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Also check and add missing columns to report_templates
ALTER TABLE public.report_templates ADD COLUMN IF NOT EXISTS background_pdf_url TEXT;
ALTER TABLE public.report_templates ADD COLUMN IF NOT EXISTS header_html TEXT;
ALTER TABLE public.report_templates ADD COLUMN IF NOT EXISTS footer_html TEXT;
ALTER TABLE public.report_templates ADD COLUMN IF NOT EXISTS margins JSONB DEFAULT '{"top": 25, "right": 15, "bottom": 20, "left": 15}'::jsonb;
ALTER TABLE public.report_templates ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE;
ALTER TABLE public.report_templates ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
