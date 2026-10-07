-- Pinnwand: eigene Sparten je Person (z. B. "Offene Posten", "Nebenkosten").
-- Jede Person legt ihre Sparten selbst an; die Sparte haengt an der Karte
-- auf der eigenen Wand (board_pins), nicht an der Aufgabe selbst.

CREATE TABLE IF NOT EXISTS public.board_sparten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  color text NOT NULL DEFAULT 'stein',
  sort_order double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_sparten_user ON public.board_sparten (user_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_sparten TO authenticated;
GRANT ALL ON public.board_sparten TO service_role;
ALTER TABLE public.board_sparten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_sparten_own ON public.board_sparten;
CREATE POLICY board_sparten_own ON public.board_sparten
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_has_admin_access(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.user_has_admin_access(auth.uid()));

ALTER TABLE public.board_pins
  ADD COLUMN IF NOT EXISTS sparte_id uuid REFERENCES public.board_sparten(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_board_pins_sparte ON public.board_pins (sparte_id) WHERE sparte_id IS NOT NULL;
