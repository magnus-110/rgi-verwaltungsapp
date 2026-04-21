UPDATE chart_of_accounts
SET settlement_section = 'reserve',
    is_billing_relevant = false
WHERE account_number IN ('1850', '1860')
  AND building_id IS NULL;