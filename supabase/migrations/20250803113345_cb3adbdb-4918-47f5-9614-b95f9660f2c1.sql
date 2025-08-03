-- Add user_id column to weg_owners table to link with auth users
ALTER TABLE public.weg_owners ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policy to allow admins to manage weg_owners entries
DROP POLICY IF EXISTS "Admins can manage weg owners" ON public.weg_owners;

CREATE POLICY "Admins can manage weg owners" 
ON public.weg_owners 
FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role)
WITH CHECK (get_user_role(auth.uid()) = 'admin'::app_role);