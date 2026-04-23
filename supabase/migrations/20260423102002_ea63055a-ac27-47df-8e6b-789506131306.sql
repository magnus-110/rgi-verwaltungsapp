-- Bestehenden Check-Constraint ersetzen, um neuen Section-Wert 'heating' zu erlauben
ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_settlement_section_check;

ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_settlement_section_check
  CHECK (settlement_section IS NULL OR settlement_section IN (
    'income',
    'operating_distributable',
    'operating_non_distributable',
    'heating',
    'heating_prepayment',
    'reserve',
    'reserve_withdrawal',
    'accrual',
    'bank',
    'opening'
  ));

-- Heizungs-Hauptkonto 1400 in neuen Block verschieben
UPDATE public.chart_of_accounts
SET settlement_section = 'heating'
WHERE account_number = '1400'
  AND is_heating_relevant = true;