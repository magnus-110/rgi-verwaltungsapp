-- Add foreign key relationship between weg_owner_buildings and buildings
ALTER TABLE public.weg_owner_buildings 
ADD CONSTRAINT fk_weg_owner_buildings_building_id 
FOREIGN KEY (building_id) REFERENCES public.buildings(id) ON DELETE CASCADE;

-- Ensure all buildings have building codes (update any that are missing)
UPDATE public.buildings 
SET building_code = CONCAT('WEG-', SUBSTRING(id::text FROM 1 FOR 8))
WHERE building_code IS NULL OR building_code = '';

-- Make building_code not null for WEG buildings
ALTER TABLE public.buildings 
ALTER COLUMN building_code SET NOT NULL;