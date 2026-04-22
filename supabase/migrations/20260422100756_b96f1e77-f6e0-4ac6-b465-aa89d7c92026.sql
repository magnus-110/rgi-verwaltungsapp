ALTER TABLE public.chart_of_accounts 
  ADD COLUMN IF NOT EXISTS is_reserve_funded boolean NOT NULL DEFAULT false;

UPDATE public.chart_of_accounts 
  SET is_reserve_funded = true 
  WHERE account_number = '1920';

COMMENT ON COLUMN public.chart_of_accounts.is_reserve_funded IS 
  'Aufwand wird aus der Erhaltungsrücklage finanziert. In der Einzelabrechnung als Aufwand UND als Negativposten im IHR-Block (Neutralisation).';