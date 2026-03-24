-- Drop global unique constraint on account_number
ALTER TABLE public.chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_account_number_key;

-- Add partial unique index for global accounts (building_id IS NULL)
CREATE UNIQUE INDEX chart_of_accounts_account_number_global_key 
ON public.chart_of_accounts (account_number) 
WHERE building_id IS NULL;

-- Add partial unique index for building-specific accounts
CREATE UNIQUE INDEX chart_of_accounts_building_account_number_key 
ON public.chart_of_accounts (building_id, account_number) 
WHERE building_id IS NOT NULL;