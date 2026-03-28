CREATE POLICY "WEG owners can view proxies granted to them"
ON public.etv_attendees
FOR SELECT TO authenticated
USING (
  proxy_contact_id IN (
    SELECT c.id FROM public.contacts c WHERE c.user_id = auth.uid()
  )
);