-- Update the building code generation function to ensure proper format
CREATE OR REPLACE FUNCTION generate_building_code(management_mode_param management_mode)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  prefix TEXT;
  formatted_number TEXT;
BEGIN
  -- Set prefix based on management mode
  IF management_mode_param = 'weg' THEN
    prefix := 'WEG-';
  ELSE
    prefix := 'MIETE-';
  END IF;
  
  -- Get the next sequential number for this management mode
  SELECT COALESCE(MAX(
    CASE 
      WHEN building_code ~ ('^' || prefix || '[0-9]{6}$') THEN
        RIGHT(building_code, 6)::INTEGER
      ELSE 0
    END
  ), 0) + 1
  INTO next_number
  FROM buildings
  WHERE management_mode = management_mode_param;
  
  -- Format number with leading zeros (6 digits)
  formatted_number := LPAD(next_number::TEXT, 6, '0');
  
  RETURN prefix || formatted_number;
END;
$$;