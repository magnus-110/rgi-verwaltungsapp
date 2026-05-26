WITH ordered AS (
  SELECT s.building_id, lpad(ROW_NUMBER() OVER (ORDER BY b.name)::text, 3, '0') AS new_num
  FROM public.key_property_settings s
  JOIN public.buildings b ON b.id = s.building_id
)
UPDATE public.key_property_settings s
SET property_number = o.new_num
FROM ordered o
WHERE s.building_id = o.building_id;