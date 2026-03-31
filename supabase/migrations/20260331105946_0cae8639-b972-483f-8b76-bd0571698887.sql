
-- Phase 1: Add settlement columns to chart_of_accounts
ALTER TABLE chart_of_accounts 
  ADD COLUMN IF NOT EXISTS is_distributable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS settlement_section text,
  ADD COLUMN IF NOT EXISTS settlement_35a_type text;

-- Set defaults based on existing flags
UPDATE chart_of_accounts SET is_distributable = true WHERE is_billing_relevant = true;
UPDATE chart_of_accounts SET settlement_section = 'operating_distributable' WHERE is_billing_relevant = true AND settlement_section IS NULL;
UPDATE chart_of_accounts SET settlement_section = 'accrual' WHERE category ILIKE '%abgrenz%' AND settlement_section IS NULL;

-- Create heating_distribution_values table
CREATE TABLE IF NOT EXISTS heating_distribution_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  billing_period_id uuid NOT NULL REFERENCES billing_periods(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES contact_building_assignments(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(billing_period_id, assignment_id)
);

ALTER TABLE heating_distribution_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage heating_distribution_values" 
  ON heating_distribution_values
  FOR ALL TO authenticated 
  USING (user_has_admin_access(auth.uid()))
  WITH CHECK (user_has_admin_access(auth.uid()));
