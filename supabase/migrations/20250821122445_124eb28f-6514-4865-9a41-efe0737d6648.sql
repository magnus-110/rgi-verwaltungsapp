-- Add unique indexes to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_weg_owners_user_id ON weg_owners(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_weg_owner_buildings_user_building ON weg_owner_buildings(user_id, building_id);

-- Backfill missing weg_owners from profiles with weg_owner role
INSERT INTO weg_owners (user_id, email, first_name, last_name, phone)
SELECT 
  p.user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone
FROM profiles p
LEFT JOIN weg_owners w ON w.user_id = p.user_id
WHERE p.role = 'weg_owner' AND w.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;