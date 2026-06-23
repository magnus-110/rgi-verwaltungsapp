
CREATE TABLE public.time_clock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  note text,
  source text NOT NULL DEFAULT 'button' CHECK (source IN ('button','manual')),
  edited_by uuid,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX time_clock_entries_one_open_per_user
  ON public.time_clock_entries(user_id) WHERE ended_at IS NULL;
CREATE INDEX time_clock_entries_user_started_idx
  ON public.time_clock_entries(user_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_clock_entries TO authenticated;
GRANT ALL ON public.time_clock_entries TO service_role;

ALTER TABLE public.time_clock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own time entries"
  ON public.time_clock_entries FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all time entries"
  ON public.time_clock_entries FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Admins update all time entries"
  ON public.time_clock_entries FOR UPDATE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin'::app_role)
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Admins delete all time entries"
  ON public.time_clock_entries FOR DELETE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin'::app_role);

CREATE TRIGGER time_clock_entries_updated_at
  BEFORE UPDATE ON public.time_clock_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
