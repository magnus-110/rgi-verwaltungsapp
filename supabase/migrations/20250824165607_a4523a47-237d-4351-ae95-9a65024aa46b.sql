-- Fix existing empty building codes
UPDATE public.buildings 
SET building_code = public.generate_building_code(management_mode)
WHERE building_code IS NULL OR building_code = '';

-- Ensure the trigger function handles concurrent access better
CREATE OR REPLACE FUNCTION public.trg_set_building_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_code text;
  max_attempts integer := 10;
  attempt integer := 0;
BEGIN
  -- Only generate if no code was provided or it's empty/whitespace
  IF NEW.building_code IS NULL OR btrim(NEW.building_code) = '' THEN
    LOOP
      attempt := attempt + 1;
      new_code := public.generate_building_code(NEW.management_mode);
      
      -- Check if this code already exists
      IF NOT EXISTS (SELECT 1 FROM public.buildings WHERE building_code = new_code) THEN
        NEW.building_code := new_code;
        EXIT;
      END IF;
      
      -- Prevent infinite loops
      IF attempt >= max_attempts THEN
        RAISE EXCEPTION 'Could not generate unique building code after % attempts', max_attempts;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;