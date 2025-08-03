-- Synchronize phone numbers from tenants table to profiles table
UPDATE public.profiles 
SET phone = t.phone
FROM public.tenants t
WHERE profiles.user_id = t.user_id
AND t.phone IS NOT NULL
AND (profiles.phone IS NULL OR profiles.phone = '');

-- Create a trigger to keep phone numbers synchronized between tenants and profiles
CREATE OR REPLACE FUNCTION sync_tenant_phone_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Update profile when tenant phone is updated
  IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
    UPDATE public.profiles 
    SET phone = NEW.phone, updated_at = now()
    WHERE user_id = NEW.user_id;
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on tenants table to sync phone changes
DROP TRIGGER IF EXISTS sync_tenant_phone_trigger ON public.tenants;
CREATE TRIGGER sync_tenant_phone_trigger
    AFTER INSERT OR UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION sync_tenant_phone_to_profile();