-- 1. Erweiterung der settlement_section Constraint (falls vorhanden)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'chart_of_accounts'
      AND constraint_name = 'chart_of_accounts_settlement_section_check'
  ) THEN
    ALTER TABLE public.chart_of_accounts DROP CONSTRAINT chart_of_accounts_settlement_section_check;
  END IF;
END $$;

ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_settlement_section_check
  CHECK (settlement_section IS NULL OR settlement_section IN (
    'income',
    'operating_distributable',
    'operating_non_distributable',
    'accrual',
    'reserve',
    'reserve_withdrawal',
    'bank',
    'heating_prepayment',
    'opening'
  ));

-- 2. Heiz-Vorauszahlungen: Gas, Fernwärme, Strom-VZ, Wasser-VZ
UPDATE public.chart_of_accounts
SET settlement_section = 'heating_prepayment',
    is_heating_relevant = true,
    is_distributable = false,
    is_billing_relevant = true
WHERE building_id IS NULL
  AND account_number IN ('1470','1471','1472','1473');

-- 3. Instandhaltungsrücklage
UPDATE public.chart_of_accounts
SET settlement_section = 'reserve',
    carry_forward_balance = true,
    is_billing_relevant = true,
    is_distributable = false
WHERE building_id IS NULL
  AND account_number = '1810';

-- 4. Eröffnungsbuchungen
UPDATE public.chart_of_accounts
SET settlement_section = 'opening',
    carry_forward_balance = true,
    is_billing_relevant = false,
    is_distributable = false
WHERE building_id IS NULL
  AND account_number = '4000';

-- 5. §35a-Markierungen für Standard-Aufwandskonten
UPDATE public.chart_of_accounts
SET is_35a_relevant = true,
    settlement_35a_type = 'dienste'
WHERE building_id IS NULL
  AND account_number IN ('1010','1500');

UPDATE public.chart_of_accounts
SET is_35a_relevant = true,
    settlement_35a_type = 'handwerker'
WHERE building_id IS NULL
  AND account_number IN ('1440','1431');