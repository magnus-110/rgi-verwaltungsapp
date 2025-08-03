-- Update weg_owners table to link user_id with profiles table based on email
UPDATE weg_owners 
SET user_id = profiles.user_id 
FROM profiles 
WHERE weg_owners.email = profiles.email 
AND weg_owners.user_id IS NULL
AND profiles.role = 'weg_owner';