UPDATE public.chart_of_accounts
SET category = '4. WEG-Systemkonten & Rücklagen',
    settlement_section = 'reserve',
    is_asset_report_relevant = true,
    is_billing_relevant = false,
    is_distributable = false,
    carry_forward_balance = true,
    is_wirtschaftsplan_relevant = false,
    default_distribution_key = COALESCE(default_distribution_key, 'mea')
WHERE account_number IN ('1811','1812','1813','1814')
  AND building_id IS NOT NULL;