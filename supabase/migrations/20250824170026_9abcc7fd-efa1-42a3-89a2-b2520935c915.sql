-- Fix the empty building code for the latest building
UPDATE public.buildings 
SET building_code = 'WEG-000002'
WHERE building_code IS NULL OR building_code = '';

-- Drop and recreate the trigger to ensure it works properly
DROP TRIGGER IF EXISTS set_building_code_before_insert ON public.buildings;

-- Create the trigger again
CREATE TRIGGER set_building_code_before_insert
BEFORE INSERT ON public.buildings
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_building_code();