-- Backfill missing tenants entries for existing profiles with tenant role
INSERT INTO public.tenants (user_id, building_id, email, first_name, last_name, phone)
SELECT 
  p.user_id,
  p.building_id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone
FROM public.profiles p
WHERE p.role = 'tenant'
  AND p.building_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenants t 
    WHERE t.user_id = p.user_id 
    AND t.building_id = p.building_id
  );

-- Add trigger to automatically sync profile changes to tenants table
CREATE OR REPLACE FUNCTION public.sync_tenant_profile_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only handle tenant profiles with building_id
  IF NEW.role = 'tenant' AND NEW.building_id IS NOT NULL THEN
    -- Upsert into tenants table
    INSERT INTO public.tenants (user_id, building_id, email, first_name, last_name, phone)
    VALUES (NEW.user_id, NEW.building_id, NEW.email, NEW.first_name, NEW.last_name, NEW.phone)
    ON CONFLICT (user_id, building_id) 
    DO UPDATE SET
      email = EXCLUDED.email,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      phone = EXCLUDED.phone,
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT and UPDATE on profiles
CREATE TRIGGER sync_tenant_profile_trigger
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_profile_changes();