-- Update forum_posts table to be nullable for building_id to support existing data
ALTER TABLE forum_posts ALTER COLUMN building_id DROP NOT NULL;

-- Add index for better performance on building-specific queries
CREATE INDEX IF NOT EXISTS idx_forum_posts_building_management 
ON forum_posts(building_id, management_mode);

-- Update RLS policies for forum posts to be building-specific
DROP POLICY IF EXISTS "Tenants can view forum posts" ON forum_posts;

-- Policy for tenants to view posts for their building
CREATE POLICY "Tenants can view building forum posts" 
ON forum_posts 
FOR SELECT 
USING (
  get_user_role(auth.uid()) = 'tenant' 
  AND building_id IN (
    SELECT building_id 
    FROM profiles 
    WHERE user_id = auth.uid()
    UNION
    SELECT building_id 
    FROM tenants 
    WHERE user_id = auth.uid()
  )
);

-- Policy for admins to manage all forum posts
CREATE POLICY "Admins can manage all forum posts" 
ON forum_posts 
FOR ALL 
USING (get_user_role(auth.uid()) = 'admin');