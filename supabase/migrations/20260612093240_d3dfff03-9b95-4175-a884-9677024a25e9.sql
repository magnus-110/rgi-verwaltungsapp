
-- ============================================================
-- 1. Profile-Flag
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS broker_mode_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. Security-Definer-Funktion
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_broker_access(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND broker_mode_enabled = true
  );
$$;

-- ============================================================
-- 3. broker_properties
-- ============================================================
CREATE TABLE public.broker_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_type TEXT NOT NULL CHECK (listing_type IN ('rent', 'sale')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  title TEXT NOT NULL,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  -- Preis
  price_eur NUMERIC(12,2),
  deposit_eur NUMERIC(12,2),
  cold_rent_eur NUMERIC(12,2),
  service_charge_eur NUMERIC(12,2),
  heating_cost_eur NUMERIC(12,2),
  -- Provision
  commission_buyer_pct NUMERIC(5,2),
  commission_seller_pct NUMERIC(5,2),
  commission_tenant_pct NUMERIC(5,2),
  commission_note TEXT,
  -- Größen
  living_space_sqm NUMERIC(10,2),
  plot_size_sqm NUMERIC(10,2),
  rooms NUMERIC(4,1),
  bedrooms INT,
  bathrooms INT,
  floor INT,
  total_floors INT,
  year_built INT,
  available_from DATE,
  property_type TEXT,
  condition TEXT,
  heating_type TEXT,
  energy_class TEXT,
  energy_value NUMERIC(8,2),
  features TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  internal_notes TEXT,
  primary_image_file_id UUID,
  owner_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_properties TO authenticated;
GRANT ALL ON public.broker_properties TO service_role;

ALTER TABLE public.broker_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker users can manage properties"
  ON public.broker_properties FOR ALL
  USING (public.has_broker_access(auth.uid()))
  WITH CHECK (public.has_broker_access(auth.uid()));

CREATE INDEX idx_broker_properties_listing_type ON public.broker_properties(listing_type);
CREATE INDEX idx_broker_properties_is_active ON public.broker_properties(is_active);

-- ============================================================
-- 4. broker_leads
-- ============================================================
CREATE TABLE public.broker_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.broker_properties(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  external_name TEXT,
  external_email TEXT,
  external_phone TEXT,
  status TEXT NOT NULL DEFAULT 'neu'
    CHECK (status IN ('neu','kontaktiert','besichtigung','angebot','abschluss','absage')),
  rating INT CHECK (rating BETWEEN 0 AND 5),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_leads TO authenticated;
GRANT ALL ON public.broker_leads TO service_role;

ALTER TABLE public.broker_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker users can manage leads"
  ON public.broker_leads FOR ALL
  USING (public.has_broker_access(auth.uid()))
  WITH CHECK (public.has_broker_access(auth.uid()));

CREATE INDEX idx_broker_leads_property ON public.broker_leads(property_id);

-- ============================================================
-- 5. broker_lead_events
-- ============================================================
CREATE TABLE public.broker_lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.broker_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('call','viewing','email','note','offer','document_sent','status_change')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT,
  body TEXT,
  email_id UUID,
  calendar_event_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_lead_events TO authenticated;
GRANT ALL ON public.broker_lead_events TO service_role;

ALTER TABLE public.broker_lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker users can manage lead events"
  ON public.broker_lead_events FOR ALL
  USING (public.has_broker_access(auth.uid()))
  WITH CHECK (public.has_broker_access(auth.uid()));

CREATE INDEX idx_broker_lead_events_lead ON public.broker_lead_events(lead_id);
CREATE INDEX idx_broker_lead_events_occurred ON public.broker_lead_events(occurred_at DESC);

-- ============================================================
-- 6. broker_property_notes
-- ============================================================
CREATE TABLE public.broker_property_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.broker_properties(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_property_notes TO authenticated;
GRANT ALL ON public.broker_property_notes TO service_role;

ALTER TABLE public.broker_property_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broker users can manage property notes"
  ON public.broker_property_notes FOR ALL
  USING (public.has_broker_access(auth.uid()))
  WITH CHECK (public.has_broker_access(auth.uid()));

CREATE INDEX idx_broker_property_notes_property ON public.broker_property_notes(property_id);

-- ============================================================
-- 7. Erweiterungen bestehender Tabellen
-- ============================================================
ALTER TABLE public.building_files
  ADD COLUMN IF NOT EXISTS broker_property_id UUID
    REFERENCES public.broker_properties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_building_files_broker_property ON public.building_files(broker_property_id);

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS broker_property_id UUID,
  ADD COLUMN IF NOT EXISTS broker_lead_id UUID;
-- (FKs ohne Cascade, da emails-Bereich separat verwaltet)
CREATE INDEX IF NOT EXISTS idx_emails_broker_lead ON public.emails(broker_lead_id);

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS broker_property_id UUID,
  ADD COLUMN IF NOT EXISTS broker_lead_id UUID;
CREATE INDEX IF NOT EXISTS idx_calendar_events_broker_lead ON public.calendar_events(broker_lead_id);

-- ============================================================
-- 8. updated_at-Trigger (Funktion existiert bereits im Projekt)
-- ============================================================
CREATE TRIGGER trg_broker_properties_updated
  BEFORE UPDATE ON public.broker_properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_broker_leads_updated
  BEFORE UPDATE ON public.broker_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_broker_property_notes_updated
  BEFORE UPDATE ON public.broker_property_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 9. RPC: ensure_broker_categories
--    Legt feste DMS-Ordner für ein Makler-Objekt an
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_broker_categories(p_property_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cats TEXT[][] := ARRAY[
    ARRAY['Bilder','broker-bilder'],
    ARRAY['Exposé','broker-expose'],
    ARRAY['Grundrisse','broker-grundrisse'],
    ARRAY['Energieausweis','broker-energieausweis'],
    ARRAY['Grundbuchauszug','broker-grundbuch'],
    ARRAY['Katasterauszug','broker-kataster'],
    ARRAY['Teilungserklärung','broker-teilungserklaerung'],
    ARRAY['Protokolle','broker-protokolle'],
    ARRAY['Abrechnungen','broker-abrechnungen'],
    ARRAY['Wirtschaftsplan','broker-wirtschaftsplan']
  ];
  v_row TEXT[];
  v_idx INT := 0;
BEGIN
  FOREACH v_row SLICE 1 IN ARRAY v_cats LOOP
    v_idx := v_idx + 1;
    INSERT INTO public.building_file_categories
      (name, slug, building_id, sort_order, is_recommended, auto_rag_enabled)
    SELECT
      v_row[1],
      v_row[2] || '-' || p_property_id::TEXT,
      NULL,
      v_idx,
      true,
      true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.building_file_categories
      WHERE slug = v_row[2] || '-' || p_property_id::TEXT
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_broker_categories(UUID) TO authenticated;
