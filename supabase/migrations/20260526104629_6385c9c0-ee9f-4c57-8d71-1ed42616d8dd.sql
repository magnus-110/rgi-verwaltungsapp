CREATE OR REPLACE FUNCTION public.auto_assign_key_property_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.property_number IS NULL OR NEW.property_number = '' THEN
    SELECT lpad((COALESCE(MAX(property_number::int), 0) + 1)::text, 3, '0')
      INTO NEW.property_number
    FROM public.key_property_settings
    WHERE property_number ~ '^[0-9]+$';
    IF NEW.property_number IS NULL THEN
      NEW.property_number := '001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_key_property_number ON public.key_property_settings;
CREATE TRIGGER trg_auto_assign_key_property_number
BEFORE INSERT ON public.key_property_settings
FOR EACH ROW EXECUTE FUNCTION public.auto_assign_key_property_number();