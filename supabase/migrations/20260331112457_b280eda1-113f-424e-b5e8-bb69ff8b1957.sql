
-- Set correct defaults for ALL global accounts
-- 1. Umlagefähige Betriebskosten (1000-1303): billing=true, distributable=true, section=operating_distributable, wp=true
UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  settlement_section = 'operating_distributable',
  is_wirtschaftsplan_relevant = true
WHERE building_id IS NULL
  AND account_number ~ '^1[0-3][0-9]{2}$'
  AND account_number NOT IN ('00000');

-- 2. §35a dienste for service accounts (Hausmeister, Winterdienst, Gartenpflege, Reinigung, Schornsteinfeger, Aufzug, etc.)
UPDATE chart_of_accounts SET
  settlement_35a_type = 'dienste',
  is_35a_relevant = true
WHERE building_id IS NULL
  AND account_number IN ('1060','1061','1062','1070','1071','1080','1090','1100','1110','1120','1130','1000');

-- 3. Heizkosten (1400-1461): billing=true, distributable=true, heating=true, section=operating_distributable, wp=true
UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  is_heating_relevant = true,
  settlement_section = 'operating_distributable',
  is_wirtschaftsplan_relevant = true
WHERE building_id IS NULL
  AND account_number ~ '^14[0-6][0-9]$';

-- 4. Vorauszahlungen (1470-1473): not billing, bank section, carry_forward
UPDATE chart_of_accounts SET
  is_billing_relevant = false,
  is_distributable = false,
  settlement_section = 'bank',
  is_wirtschaftsplan_relevant = false,
  carry_forward_balance = true
WHERE building_id IS NULL
  AND account_number IN ('1470','1471','1472','1473');

-- 5. Verwaltungskosten (1500-1560): billing=true, distributable=true, section=operating_non_distributable, wp=true
UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  settlement_section = 'operating_non_distributable',
  is_wirtschaftsplan_relevant = true
WHERE building_id IS NULL
  AND account_number ~ '^15[0-6][0-9]$';

-- 6. Instandhaltung (1600-1699): billing=true, distributable=true, section=operating_non_distributable, wp=true, 35a=handwerker
UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  settlement_section = 'operating_non_distributable',
  is_wirtschaftsplan_relevant = true,
  settlement_35a_type = 'handwerker',
  is_35a_relevant = true
WHERE building_id IS NULL
  AND account_number ~ '^16[0-9]{2}$';

-- 7. Rücklage (1700-1720): billing=true, distributable=true, section=reserve, wp=true, carry_forward
UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  settlement_section = 'reserve',
  is_wirtschaftsplan_relevant = true,
  carry_forward_balance = true
WHERE building_id IS NULL
  AND account_number ~ '^17[0-2][0-9]$';

-- 8. Bankkonten (1800-1810): not billing, bank section, carry_forward
UPDATE chart_of_accounts SET
  is_billing_relevant = false,
  is_distributable = false,
  settlement_section = 'bank',
  is_wirtschaftsplan_relevant = false,
  carry_forward_balance = true
WHERE building_id IS NULL
  AND account_number IN ('1800','1810');

-- 9. Zinserträge (1840): billing=true, distributable=true, section=income
UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  settlement_section = 'income',
  is_wirtschaftsplan_relevant = false
WHERE building_id IS NULL
  AND account_number = '1840';

-- 10. Bankgebühren / Steuern (1850, 1860): billing=true, distributable=true, section=operating_non_distributable
UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  settlement_section = 'operating_non_distributable',
  is_wirtschaftsplan_relevant = false
WHERE building_id IS NULL
  AND account_number IN ('1850','1860');

-- 11. Sonstige Kosten / Versicherungsschäden (1900-1940)
UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  settlement_section = 'operating_non_distributable',
  is_wirtschaftsplan_relevant = false
WHERE building_id IS NULL
  AND account_number IN ('1900','1910','1920','1930');

-- 12. §35a Sonderkonten (1935, 1940)
UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  settlement_section = 'operating_non_distributable',
  is_wirtschaftsplan_relevant = false,
  settlement_35a_type = 'dienste',
  is_35a_relevant = true
WHERE building_id IS NULL
  AND account_number = '1935';

UPDATE chart_of_accounts SET
  is_billing_relevant = true,
  is_distributable = true,
  settlement_section = 'operating_non_distributable',
  is_wirtschaftsplan_relevant = false,
  settlement_35a_type = 'handwerker',
  is_35a_relevant = true
WHERE building_id IS NULL
  AND account_number = '1940';

-- 13. Eröffnungen / Abgrenzung (4000-4180, 09999.*): accrual section
UPDATE chart_of_accounts SET
  is_billing_relevant = false,
  is_distributable = false,
  settlement_section = 'accrual',
  is_wirtschaftsplan_relevant = false
WHERE building_id IS NULL
  AND (account_number ~ '^4[0-9]{3}$' OR account_number LIKE '09999%');

-- 14. Personenkonten (00000): null section
UPDATE chart_of_accounts SET
  is_billing_relevant = false,
  is_distributable = false,
  settlement_section = NULL,
  is_wirtschaftsplan_relevant = false
WHERE building_id IS NULL
  AND account_number = '00000';

-- 15. Water distribution key for water accounts
UPDATE chart_of_accounts SET
  default_distribution_key = 'verbrauch_wasser'
WHERE building_id IS NULL
  AND account_number IN ('1030','1031','1040','1041');

-- 16. Heating distribution key for heating accounts
UPDATE chart_of_accounts SET
  default_distribution_key = 'heizkostenverordnung'
WHERE building_id IS NULL
  AND account_number ~ '^14[0-6][0-9]$';
