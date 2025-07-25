-- Create admin user in auth.users table
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'admin@rgi-immobilien.de',
  crypt('RGI2024!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  false,
  'authenticated'
);

-- Update profiles table to separate WEG and rental buildings
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS type text DEFAULT 'weg';

-- Add building_id to profiles for tenants only (rental management)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id);

-- Create WEG owners table (separate from tenants)
CREATE TABLE IF NOT EXISTS weg_owners (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  first_name text,
  last_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS for weg_owners
ALTER TABLE weg_owners ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to manage WEG owners
CREATE POLICY "Admins can manage weg owners" ON weg_owners
FOR ALL USING (get_user_role(auth.uid()) = 'admin');

-- Update reports table to handle both WEG and rental
ALTER TABLE reports ADD COLUMN IF NOT EXISTS weg_owner_id uuid REFERENCES weg_owners(id);

-- Create trigger for weg_owners updated_at
CREATE TRIGGER update_weg_owners_updated_at
BEFORE UPDATE ON weg_owners
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();