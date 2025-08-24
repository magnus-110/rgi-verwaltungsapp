-- Fix the empty building code by setting it to a unique value
UPDATE public.buildings 
SET building_code = 'WEG-000001'
WHERE building_code IS NULL OR building_code = '';

-- Also improve the generate_building_code function to handle edge cases better
CREATE OR REPLACE FUNCTION public.generate_building_code(management_mode_param management_mode)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_number INTEGER;
  prefix TEXT;
  formatted_number TEXT;
  candidate_code TEXT;
  max_attempts INTEGER := 100;
  attempt INTEGER := 0;
BEGIN
  -- Set prefix based on management mode
  IF management_mode_param = 'weg' THEN
    prefix := 'WEG-';
  ELSE
    prefix := 'MIETE-';
  END IF;
  
  LOOP
    attempt := attempt + 1;
    
    -- Get the next sequential number for this management mode
    SELECT COALESCE(MAX(
      CASE 
        WHEN building_code ~ ('^' || prefix || '[0-9]{6}$') THEN
          RIGHT(building_code, 6)::INTEGER
        ELSE NULL
      END
    ), 0) + attempt
    INTO next_number
    FROM buildings
    WHERE management_mode = management_mode_param
      AND building_code IS NOT NULL
      AND building_code ~ ('^' || prefix || '[0-9]{6}$');
    
    -- Format number with leading zeros (6 digits)
    formatted_number := LPAD(next_number::TEXT, 6, '0');
    candidate_code := prefix || formatted_number;
    
    -- Check if this code is unique
    IF NOT EXISTS (SELECT 1 FROM buildings WHERE building_code = candidate_code) THEN
      RETURN candidate_code;
    END IF;
    
    -- Prevent infinite loops
    IF attempt >= max_attempts THEN
      -- Fall back to a UUID-based approach
      RETURN prefix || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));
    END IF;
  END LOOP;
END;
$function$;