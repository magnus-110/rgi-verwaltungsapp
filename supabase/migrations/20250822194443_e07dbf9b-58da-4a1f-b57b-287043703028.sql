
-- Function to get building managers
CREATE OR REPLACE FUNCTION public.get_building_managers(building_id_param uuid)
RETURNS TABLE (
  manager_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  email text
) 
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT 
    bm.id as manager_id,
    bm.user_id,
    p.first_name,
    p.last_name,
    p.email
  FROM public.building_managers bm
  JOIN public.profiles p ON bm.user_id = p.user_id
  WHERE bm.building_id = building_id_param;
$$;

-- Function to count building managers
CREATE OR REPLACE FUNCTION public.count_building_managers(building_id_param uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM public.building_managers
  WHERE building_id = building_id_param;
$$;

-- Function to get building manager names
CREATE OR REPLACE FUNCTION public.get_building_manager_names(building_id_param uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT ARRAY_AGG(CONCAT(p.first_name, ' ', p.last_name))
  FROM public.building_managers bm
  JOIN public.profiles p ON bm.user_id = p.user_id
  WHERE bm.building_id = building_id_param
  AND p.first_name IS NOT NULL
  AND p.last_name IS NOT NULL;
$$;

-- Function to assign building manager
CREATE OR REPLACE FUNCTION public.assign_building_manager(
  building_id_param uuid,
  user_id_param uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.building_managers (building_id, user_id)
  VALUES (building_id_param, user_id_param);
END;
$$;

-- Function to remove building manager
CREATE OR REPLACE FUNCTION public.remove_building_manager(manager_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.building_managers
  WHERE id = manager_id_param;
END;
$$;

-- Function to save push subscription
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  user_id_param uuid,
  endpoint_param text,
  p256dh_param text,
  auth_param text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (user_id_param, endpoint_param, p256dh_param, auth_param)
  ON CONFLICT (endpoint) 
  DO UPDATE SET
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth;
END;
$$;

-- Function to remove push subscription
CREATE OR REPLACE FUNCTION public.remove_push_subscription(
  user_id_param uuid,
  endpoint_param text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.push_subscriptions
  WHERE user_id = user_id_param
  AND endpoint = endpoint_param;
END;
$$;
