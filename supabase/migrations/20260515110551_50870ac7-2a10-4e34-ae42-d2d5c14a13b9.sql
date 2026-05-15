ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_asset_report_relevant boolean NOT NULL DEFAULT false;

UPDATE chart_of_accounts SET is_asset_report_relevant = true
WHERE account_number ~ '^(18[0-9]{2}|147[0-3]|17[01]0|410[0-9]|412[0-9]|416[0-9]|418[0-9])$';