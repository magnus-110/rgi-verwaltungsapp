UPDATE emails e 
SET building_id = cba.building_id 
FROM (
  SELECT ca.contact_id, ca.building_id 
  FROM contact_building_assignments ca 
  WHERE ca.is_active = true 
  AND ca.contact_id IN (
    SELECT contact_id FROM contact_building_assignments WHERE is_active = true GROUP BY contact_id HAVING count(*) = 1
  )
) cba 
WHERE e.contact_id = cba.contact_id 
AND e.building_id IS NULL