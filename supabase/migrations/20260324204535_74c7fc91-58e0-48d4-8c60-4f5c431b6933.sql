
CREATE TABLE public.contact_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  salutation TEXT,
  first_name TEXT,
  last_name TEXT,
  position TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  is_primary BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contact_persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage contact persons"
ON public.contact_persons FOR ALL TO authenticated USING (true) WITH CHECK (true);
