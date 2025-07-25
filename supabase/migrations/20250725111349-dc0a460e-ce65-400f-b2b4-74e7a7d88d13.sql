-- Set force_password_change to false by default for all users
ALTER TABLE profiles ALTER COLUMN force_password_change SET DEFAULT false;