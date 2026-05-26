
-- 1) Spalten für Word-Vorlage je Liegenschaft
ALTER TABLE public.key_property_settings
  ADD COLUMN IF NOT EXISTS tag_template_path text,
  ADD COLUMN IF NOT EXISTS tag_template_name text,
  ADD COLUMN IF NOT EXISTS tag_template_uploaded_at timestamptz;

-- 2) Für jedes Gebäude ohne Settings-Zeile eine anlegen (Trigger setzt Nummer; wir überschreiben gleich)
INSERT INTO public.key_property_settings (building_id)
SELECT b.id FROM public.buildings b
LEFT JOIN public.key_property_settings s ON s.building_id = b.id
WHERE s.building_id IS NULL;

-- 3) Alle Nummern alphabetisch neu vergeben (001 = erstes Gebäude alphabetisch)
WITH ordered AS (
  SELECT s.building_id,
         lpad(ROW_NUMBER() OVER (ORDER BY b.name)::text, 3, '0') AS new_num
  FROM public.key_property_settings s
  JOIN public.buildings b ON b.id = s.building_id
)
UPDATE public.key_property_settings s
SET property_number = o.new_num
FROM ordered o
WHERE s.building_id = o.building_id;
