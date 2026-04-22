
-- Konto 1700: Summenetikett, kein Buchungskonto, kein Vortrag, keine Section
UPDATE chart_of_accounts
SET carry_forward_balance = false, settlement_section = NULL
WHERE account_number = '1700' AND building_id IS NULL;

-- Konto 1710: IHR-Sollstellung, kein Vortrag (Saldo entsteht aus Buchungen)
UPDATE chart_of_accounts
SET carry_forward_balance = false
WHERE account_number = '1710' AND building_id IS NULL;

-- Standardkonten Aktive/Passive Rechnungsabgrenzung anlegen, falls nicht vorhanden
INSERT INTO chart_of_accounts (
  account_number, account_name, category, settlement_section,
  carry_forward_balance, is_distributable, is_billing_relevant,
  default_distribution_key, sort_order, is_system_account
)
SELECT '4900', 'Aktive Rechnungsabgrenzung (ARA)', '5. Eröffnungen & Abgrenzung', 'accrual',
       true, false, false, 'mea', 95, true
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts WHERE account_number = '4900' AND building_id IS NULL
);

INSERT INTO chart_of_accounts (
  account_number, account_name, category, settlement_section,
  carry_forward_balance, is_distributable, is_billing_relevant,
  default_distribution_key, sort_order, is_system_account
)
SELECT '4910', 'Passive Rechnungsabgrenzung (PRA)', '5. Eröffnungen & Abgrenzung', 'accrual',
       true, false, false, 'mea', 96, true
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts WHERE account_number = '4910' AND building_id IS NULL
);
