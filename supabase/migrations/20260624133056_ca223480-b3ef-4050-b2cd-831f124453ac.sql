
CREATE OR REPLACE FUNCTION public.normalize_phone_last8(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT RIGHT(regexp_replace(coalesce(p,''), '\D', '', 'g'), 8);
$$;

CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('incoming','outgoing')),
  status text NOT NULL DEFAULT 'verpasst' CHECK (status IN ('verpasst','angenommen')),
  number_raw text,
  number_e164 text,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  connected_at timestamptz,
  ended_at timestamptz,
  duration_seconds int NOT NULL DEFAULT 0,
  note text,
  transcript text,
  handled boolean NOT NULL DEFAULT false,
  handled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX call_logs_contact_id_idx ON public.call_logs(contact_id);
CREATE INDEX call_logs_started_at_idx ON public.call_logs(started_at DESC);
CREATE INDEX call_logs_status_handled_idx ON public.call_logs(status, handled);
CREATE INDEX call_logs_number_last8_idx ON public.call_logs(public.normalize_phone_last8(number_raw));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view call logs"
  ON public.call_logs FOR SELECT TO authenticated
  USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Staff can insert call logs"
  ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Staff can update call logs"
  ON public.call_logs FOR UPDATE TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Staff can delete call logs"
  ON public.call_logs FOR DELETE TO authenticated
  USING (public.user_has_admin_access(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
ALTER TABLE public.call_logs REPLICA IDENTITY FULL;
