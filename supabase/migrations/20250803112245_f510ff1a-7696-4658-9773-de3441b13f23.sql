-- Fix the handle_new_user function to not automatically assign admin role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only assign admin role if this is the very first user (no profiles exist yet)
  IF (SELECT COUNT(*) FROM public.profiles) = 0 THEN
    INSERT INTO public.profiles (user_id, email, role)
    VALUES (NEW.id, NEW.email, 'admin');
  ELSE
    -- For all other users, just create a basic profile without role (will be set manually by admin)
    INSERT INTO public.profiles (user_id, email, role)
    VALUES (NEW.id, NEW.email, 'tenant'); -- Default to tenant, admin can change later
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create weg_owner_buildings table for many-to-many relationship
CREATE TABLE public.weg_owner_buildings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  building_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, building_id)
);

-- Enable RLS on weg_owner_buildings
ALTER TABLE public.weg_owner_buildings ENABLE ROW LEVEL SECURITY;

-- RLS policies for weg_owner_buildings
CREATE POLICY "Admins can manage weg owner buildings" 
ON public.weg_owner_buildings 
FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "WEG owners can view their own building assignments" 
ON public.weg_owner_buildings 
FOR SELECT 
USING (auth.uid() = user_id AND get_user_role(auth.uid()) = 'weg_owner'::app_role);

CREATE POLICY "WEG owners can manage their own building assignments" 
ON public.weg_owner_buildings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND get_user_role(auth.uid()) = 'weg_owner'::app_role);

CREATE POLICY "WEG owners can delete their own building assignments" 
ON public.weg_owner_buildings 
FOR DELETE 
USING (auth.uid() = user_id AND get_user_role(auth.uid()) = 'weg_owner'::app_role);

-- Add trigger for updated_at
CREATE TRIGGER update_weg_owner_buildings_updated_at
BEFORE UPDATE ON public.weg_owner_buildings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();