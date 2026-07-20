-- Fix: Neu angelegte Liegenschaften erhielten die Schlüssel-Liegenschaftsnummer '000'
-- statt einer automatisch vergebenen Nummer. Ursache: Der Spalten-Default '000'
-- verhinderte das Greifen des Auto-Vergabe-Triggers (dieser prüfte nur auf NULL/'').

-- 1) Default entfernen, damit bei fehlender Nummer der Trigger greift.
ALTER TABLE public.key_property_settings ALTER COLUMN property_number DROP DEFAULT;

-- 2) Auto-Vergabe zusätzlich '000' als "noch nicht vergeben" behandeln.
CREATE OR REPLACE FUNCTION public.auto_assign_key_property_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.property_number IS NULL OR NEW.property_number = '' OR NEW.property_number = '000' THEN
    SELECT lpad((COALESCE(MAX(property_number::int), 0) + 1)::text, 3, '0')
      INTO NEW.property_number
    FROM public.key_property_settings
    WHERE property_number ~ '^[0-9]+$' AND property_number <> '000';
    IF NEW.property_number IS NULL THEN
      NEW.property_number := '001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
