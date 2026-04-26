-- RPC: Service-Provider-Pool für Onboarding (zugänglich für authentifizierte WEG-Owner)
CREATE OR REPLACE FUNCTION public.get_service_provider_pool()
RETURNS TABLE (
  id uuid,
  name text,
  categories text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    COALESCE(
      NULLIF(c.company_name, ''),
      NULLIF(TRIM(CONCAT_WS(' ', cp.first_name, cp.last_name)), ''),
      'Unbekannt'
    ) AS name,
    COALESCE(c.service_provider_categories, ARRAY[]::text[]) AS categories
  FROM public.contacts c
  LEFT JOIN LATERAL (
    SELECT first_name, last_name
    FROM public.contact_persons
    WHERE contact_id = c.id
    ORDER BY created_at ASC
    LIMIT 1
  ) cp ON true
  WHERE c.is_service_provider_pool = true
  ORDER BY name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_service_provider_pool() TO authenticated;