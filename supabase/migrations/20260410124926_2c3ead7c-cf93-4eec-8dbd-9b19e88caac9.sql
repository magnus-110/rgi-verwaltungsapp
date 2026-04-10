-- Add default_vat_rate column
ALTER TABLE public.chart_of_accounts ADD COLUMN default_vat_rate numeric DEFAULT 19;

-- Set 0% for personal/owner accounts (0001-0999)
UPDATE public.chart_of_accounts SET default_vat_rate = 0 WHERE account_number < '1000';

-- Set 0% for bank/cash/asset accounts (1000-1899)
UPDATE public.chart_of_accounts SET default_vat_rate = 0 WHERE account_number >= '1000' AND account_number < '1900';

-- Set 0% for reserve accounts
UPDATE public.chart_of_accounts SET default_vat_rate = 0 WHERE category = 'Rücklagen';

-- Set 0% for revenue/Hausgeld accounts that are typically net
UPDATE public.chart_of_accounts SET default_vat_rate = 0 WHERE category = 'Einnahmen';