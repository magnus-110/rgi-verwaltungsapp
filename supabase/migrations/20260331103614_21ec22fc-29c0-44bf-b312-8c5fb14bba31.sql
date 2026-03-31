ALTER TABLE chart_of_accounts 
  ADD COLUMN IF NOT EXISTS is_wirtschaftsplan_relevant boolean NOT NULL DEFAULT false;

UPDATE chart_of_accounts 
  SET is_wirtschaftsplan_relevant = true 
  WHERE is_billing_relevant = true;