CREATE TABLE IF NOT EXISTS public.service_provider_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_provider_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view categories"
  ON public.service_provider_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage categories"
  ON public.service_provider_categories FOR ALL
  TO authenticated
  USING (user_has_admin_access(auth.uid()))
  WITH CHECK (user_has_admin_access(auth.uid()));

INSERT INTO public.service_provider_categories (name, sort_order) VALUES
  ('Handwerker', 10),
  ('Heizung/Sanitär', 20),
  ('Elektriker', 30),
  ('Hausmeister', 40),
  ('Versicherung', 50),
  ('Ablesefirma', 60),
  ('Schornsteinfeger', 70),
  ('Versorger', 80),
  ('Reinigung', 90),
  ('Gärtner', 100),
  ('Sonstiges', 999)
ON CONFLICT (name) DO NOTHING;