-- Update handle_new_user function to not assign admin role automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Just create a basic profile with tenant as default role
  -- The actual role will be set by the admin interface based on management mode
  INSERT INTO public.profiles (user_id, email, role)
  VALUES (NEW.id, NEW.email, 'tenant');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;