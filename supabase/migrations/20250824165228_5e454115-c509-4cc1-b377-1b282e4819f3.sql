
-- 1) Trigger-Funktion: setzt building_code vor dem INSERT, falls leer
CREATE OR REPLACE FUNCTION public.trg_set_building_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Nur generieren, wenn kein Code übergeben wurde oder nur Leerzeichen
  IF NEW.building_code IS NULL OR btrim(NEW.building_code) = '' THEN
    NEW.building_code := public.generate_building_code(NEW.management_mode);
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Trigger neu anlegen (falls vorhanden, zuerst entfernen)
DROP TRIGGER IF EXISTS set_building_code_before_insert ON public.buildings;

CREATE TRIGGER set_building_code_before_insert
BEFORE INSERT ON public.buildings
FOR EACH ROW
EXECUTE FUNCTION public.trg_set_building_code();

-- 3) Einmalige Nachbefüllung für bereits vorhandene leere Codes
DO $do$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, management_mode
    FROM public.buildings
    WHERE building_code IS NULL OR btrim(building_code) = ''
    ORDER BY created_at, id
  LOOP
    UPDATE public.buildings
    SET building_code = public.generate_building_code(r.management_mode)
    WHERE id = r.id;
  END LOOP;
END
$do$;
