-- Add RLS policy for WEG owners to view forum posts for their buildings
CREATE POLICY "WEG owners can view forum posts for their buildings" 
ON public.forum_posts 
FOR SELECT 
USING (
  get_user_role(auth.uid()) = 'weg_owner'::app_role 
  AND building_id IN (
    SELECT building_id 
    FROM weg_owner_buildings 
    WHERE user_id = auth.uid()
  )
);