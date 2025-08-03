-- Add building_code column to buildings table
ALTER TABLE public.buildings 
ADD COLUMN building_code TEXT UNIQUE;

-- Add index for faster lookups
CREATE INDEX idx_buildings_building_code ON public.buildings(building_code);

-- Add some example codes for existing buildings (admins can change these)
UPDATE public.buildings 
SET building_code = 'WEG-' || SUBSTRING(id::text, 1, 6)
WHERE building_code IS NULL;