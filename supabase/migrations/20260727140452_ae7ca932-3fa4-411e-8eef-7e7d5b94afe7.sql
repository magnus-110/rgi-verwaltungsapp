
CREATE OR REPLACE FUNCTION public.generate_key_tag_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loc_code text;
  v_prop_num text;
  v_next_seq int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.tag_number IS NOT NULL AND NEW.key_type_id = OLD.key_type_id AND NEW.storage_location_id = OLD.storage_location_id AND NEW.building_id = OLD.building_id THEN
    NEW.tag_number := OLD.tag_number;
    NEW.sequence_number := OLD.sequence_number;
    RETURN NEW;
  END IF;

  SELECT code INTO v_loc_code FROM public.key_storage_locations WHERE id = NEW.storage_location_id;
  SELECT COALESCE(property_number::text, '000') INTO v_prop_num FROM public.key_property_settings WHERE building_id = NEW.building_id;

  SELECT COALESCE(MAX(sequence_number),0)+1 INTO v_next_seq
  FROM public.key_tags
  WHERE building_id = NEW.building_id AND key_type_id = NEW.key_type_id;

  NEW.sequence_number := v_next_seq;
  NEW.tag_number := COALESCE(v_loc_code,'?') || '/' || LPAD(v_prop_num,3,'0') || '-' || LPAD(v_next_seq::text,2,'0');
  RETURN NEW;
END;
$$;

-- Bestehende Nummern bereinigen: Suffix am Ende entfernen (basierend auf key_types.code_suffix)
UPDATE public.key_tags t
SET tag_number = regexp_replace(t.tag_number, '[A-Za-z]+$', '')
WHERE tag_number ~ '[A-Za-z]+$';
