
-- Add optional manager_name column to buildings for storing responsible manager
ALTER TABLE public.buildings
ADD COLUMN IF NOT EXISTS manager_name text;
