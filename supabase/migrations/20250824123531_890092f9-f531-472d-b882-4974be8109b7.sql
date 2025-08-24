
-- Allow tenants to read their own tenant row
CREATE POLICY "Tenants can view own tenant row"
ON public.tenants
FOR SELECT
USING (user_id = auth.uid());
