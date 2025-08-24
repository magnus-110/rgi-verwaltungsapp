
BEGIN;

-- 1) Sequenzen pro Management-Modus
CREATE SEQUENCE IF NOT EXISTS public.weg_building_code_seq
  START WITH 1 INCREMENT BY 1 MINVALUE 1 OWNED BY NONE;

CREATE SEQUENCE IF NOT EXISTS public.miete_building_code_seq
  START WITH 1 INCREMENT BY 1 MINVALUE 1 OWNED BY NONE;

-- 2) Sequenzen auf aktuellen Stand der Daten setzen
-- WEG
SELECT setval(
  'public.weg_building_code_seq',
  COALESCE((
    SELECT MAX(RIGHT(building_code, 6)::int)
    FROM public.buildings
    WHERE management_mode = 'weg'::management_mode
      AND building_code ~ '^WEG-[0-9]{6}$'
  ), 0)
);

-- MIETE
SELECT setval(
  'public.miete_building_code_seq',
  COALESCE((
    SELECT MAX(RIGHT(building_code, 6)::int)
    FROM public.buildings
    WHERE management_mode = 'miete'::management_mode
      AND building_code ~ '^MIETE-[0-9]{6}$'
  ), 0)
);

-- 3) Trigger-Funktion zur automatischen Codevergabe
CREATE OR REPLACE FUNCTION public.set_building_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
  prefix text;
BEGIN
  -- Wenn bereits ein Code mitgeschickt wurde, nicht überschreiben
  IF NEW.building_code IS NOT NULL AND NEW.building_code <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.management_mode = 'weg'::management_mode THEN
    prefix := 'WEG-';
    next_num := nextval('public.weg_building_code_seq');
  ELSE
    prefix := 'MIETE-';
    next_num := nextval('public.miete_building_code_seq');
  END IF;

  NEW.building_code := prefix || LPAD(next_num::text, 6, '0');
  RETURN NEW;
END;
$$;

-- 4) Trigger anlegen/erneuern
DROP TRIGGER IF EXISTS trg_set_building_code ON public.buildings;

CREATE TRIGGER trg_set_building_code
BEFORE INSERT ON public.buildings
FOR EACH ROW
EXECUTE FUNCTION public.set_building_code();

COMMIT;
