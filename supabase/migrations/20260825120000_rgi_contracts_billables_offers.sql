-- ============================================================
-- RGI Intern: Verwaltervertraege, abrechenbare Zusatzleistungen
--             und Angebote
--
-- Grundsatz: Automatik schlaegt vor, sie entscheidet nie.
-- Jeder Betrag und jede Menge ist manuell eintragbar und
-- ueberschreibbar. Nichts wird aus anderen Tabellen erzwungen.
--
-- Die Grundverguetung laeuft NICHT ueber billable_events:
-- sie wird als Selbstentnahme vom WEG-Konto abgebucht.
-- ============================================================

-- ============ Enums ============
CREATE TYPE rgi_contract_status AS ENUM ('draft', 'active', 'ended');

CREATE TYPE rgi_fee_unit_kind AS ENUM ('apartment', 'commercial', 'parking', 'other');

CREATE TYPE rgi_fee_basis AS ENUM (
  'unit_month',            -- EUR je Einheit und Monat (Grundverguetung)
  'case',                  -- EUR je Vorgang (Eigentuemerwechsel, a.o. ETV)
  'item_year',             -- EUR je Stueck und Jahr (Paragraf 35a)
  'item',                  -- EUR je Stueck (Ersatzschluessel, Kopien)
  'hour',                  -- EUR je Stunde
  'claim_payout',          -- Prozent der Versicherungsentschaedigung
  'gross_project_volume',  -- Prozent des Bruttobauvolumens
  'monthly_flat',          -- Pauschale je Monat (Mietverwaltung)
  'net_rent_percent',      -- Prozent der Nettomiete (Mietverwaltung)
  'custom'
);

CREATE TYPE rgi_fee_debtor AS ENUM ('community', 'owner', 'tenant');

CREATE TYPE rgi_billable_status AS ENUM (
  'detected',   -- erkannt, noch nicht geprueft
  'approved',   -- geprueft und freigegeben
  'invoiced',   -- auf einer Rechnung
  'settled',    -- Beleg zugeordnet, erledigt
  'dismissed'   -- verworfen, mit Grund
);

CREATE TYPE rgi_offer_status AS ENUM ('inquiry', 'drafted', 'sent', 'won', 'lost', 'withdrawn');

CREATE TYPE rgi_offer_question_kind AS ENUM ('text', 'number', 'boolean', 'choice');

-- ============ Verwaltervertrag (Kopf) ============
-- Versioniert ueber appointed_from / appointed_until, damit
-- Folgefassungen (z.B. Sorgschrofenweg 2 ab 01.09.2027) neben
-- der laufenden Fassung stehen koennen.
CREATE TABLE public.management_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  status rgi_contract_status NOT NULL DEFAULT 'draft',
  label TEXT,                                  -- z.B. "Fassung 2026" zur Unterscheidung
  appointed_from DATE,
  appointed_until DATE,                        -- NULL = unbefristet / bis auf Weiteres
  resolution_date DATE,
  resolution_ref TEXT,                         -- Beschluss, TOP, Umlaufbeschluss
  -- Grundverguetung
  parking_billed_separately BOOLEAN NOT NULL DEFAULT false,
  units_apartment INTEGER,                     -- manuell, NICHT aus buildings.unit_count
  units_commercial INTEGER,
  units_parking INTEGER,
  units_other INTEGER,
  -- Indexanpassung (VPI, kein Automatismus, Verlangen einer Partei)
  index_base_month DATE,
  index_base_value NUMERIC(8,2),
  index_lock_months INTEGER DEFAULT 12,
  index_last_applied DATE,
  -- Sonstiges
  self_debit_day INTEGER DEFAULT 3,            -- 3. Werktag, Selbstentnahme
  payment_interval TEXT DEFAULT 'monatlich',
  template_version TEXT,                       -- 'boorberg_m54510' | 'rgi_2026' | frei
  approval_limit_amount NUMERIC(12,2),         -- Freigabegrenze Eigenauftraege
  approval_limit_note TEXT,
  termination_note TEXT,                       -- Kuendigung / Abberufung, Paragraf 26 WEG
  dms_file_id UUID REFERENCES public.building_files(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_management_contracts_building ON public.management_contracts(building_id);
CREATE INDEX idx_management_contracts_status ON public.management_contracts(status);
CREATE INDEX idx_management_contracts_until ON public.management_contracts(appointed_until);

GRANT ALL ON public.management_contracts TO service_role;
ALTER TABLE public.management_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "management_contracts_admin_all" ON public.management_contracts FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

CREATE TRIGGER trg_management_contracts_updated_at
  BEFORE UPDATE ON public.management_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Honorarbausteine ============
-- Ein Datensatz je vereinbarter Position. fee_type ist absichtlich
-- TEXT und kein Enum, damit eigene Positionen ohne Migration
-- dazukommen koennen.
CREATE TABLE public.management_contract_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.management_contracts(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL,                      -- base | owner_change | cert_35a |
                                               -- extra_meeting | insurance_pct |
                                               -- construction_pct | hourly | reminder |
                                               -- key | copies | frei benennbar
  label TEXT NOT NULL,                         -- Anzeigetext, immer ueberschreibbar
  unit_kind rgi_fee_unit_kind,                 -- nur bei basis = unit_month
  basis rgi_fee_basis NOT NULL DEFAULT 'case',
  amount NUMERIC(12,2),                        -- Betrag je Bemessungseinheit
  percent NUMERIC(6,3),                        -- alternativ Prozentsatz
  quantity INTEGER,                            -- vertraglich vereinbarte Anzahl
  is_gross BOOLEAN NOT NULL DEFAULT false,     -- Grundverguetung netto, Zusatz teils brutto
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19,
  threshold NUMERIC(12,2),                     -- z.B. Bausumme ab 5.000
  min_amount NUMERIC(12,2),                    -- z.B. mindestens 250,00
  max_amount NUMERIC(12,2),
  max_count INTEGER,                           -- z.B. hoechstens 3 Mahnungen
  debtor rgi_fee_debtor NOT NULL DEFAULT 'community',
  role TEXT,                                   -- bei hourly: management | specialist | technical
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  valid_from DATE,
  valid_to DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contract_fees_contract ON public.management_contract_fees(contract_id);
CREATE INDEX idx_contract_fees_type ON public.management_contract_fees(fee_type);

GRANT ALL ON public.management_contract_fees TO service_role;
ALTER TABLE public.management_contract_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "management_contract_fees_admin_all" ON public.management_contract_fees FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

CREATE TRIGGER trg_management_contract_fees_updated_at
  BEFORE UPDATE ON public.management_contract_fees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Abrechenbare Zusatzleistung ============
CREATE TABLE public.billable_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.management_contracts(id) ON DELETE SET NULL,
  fee_id UUID REFERENCES public.management_contract_fees(id) ON DELETE SET NULL,
  status rgi_billable_status NOT NULL DEFAULT 'detected',
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  label TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  amount_net NUMERIC(12,2),
  amount_gross NUMERIC(12,2),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19,
  debtor rgi_fee_debtor NOT NULL DEFAULT 'community',
  debtor_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  assignment_id UUID REFERENCES public.contact_building_assignments(id) ON DELETE SET NULL,
  -- Herkunft, damit jede Position pruefbar bleibt
  source_kind TEXT,          -- assignment | etv_meeting | case | time_entry | reminder | manual
  source_id UUID,
  -- Abrechnung
  settled_via TEXT,          -- rgi_invoice | account_withdrawal | annual_statement
  rgi_invoice_item_id UUID REFERENCES public.rgi_invoice_items(id) ON DELETE SET NULL,
  settled_on DATE,
  dismissed_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_billable_events_building ON public.billable_events(building_id);
CREATE INDEX idx_billable_events_status ON public.billable_events(status);
CREATE INDEX idx_billable_events_occurred ON public.billable_events(occurred_on DESC);
-- Verhindert, dass dieselbe Quelle zweimal eine Position erzeugt.
CREATE UNIQUE INDEX idx_billable_events_source
  ON public.billable_events(source_kind, source_id, fee_id)
  WHERE source_kind IS NOT NULL AND source_id IS NOT NULL;

GRANT ALL ON public.billable_events TO service_role;
ALTER TABLE public.billable_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billable_events_admin_all" ON public.billable_events FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

CREATE TRIGGER trg_billable_events_updated_at
  BEFORE UPDATE ON public.billable_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Angebote ============
CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_no TEXT UNIQUE,
  status rgi_offer_status NOT NULL DEFAULT 'inquiry',
  prospect_name TEXT NOT NULL,
  prospect_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_person TEXT, contact_email TEXT, contact_phone TEXT,
  object_address TEXT, object_zip TEXT, object_city TEXT,
  management_mode management_mode NOT NULL DEFAULT 'weg',
  units_apartment INTEGER, units_commercial INTEGER,
  units_parking INTEGER, units_other INTEGER,
  desired_start DATE,
  previous_manager TEXT,
  inquiry_source TEXT,
  inquiry_date DATE DEFAULT CURRENT_DATE,
  -- Honorar: von Hand eingetragen, kein Vorschlagswert
  rate_apartment NUMERIC(12,2),
  rate_commercial NUMERIC(12,2),
  rate_parking NUMERIC(12,2),
  rate_other NUMERIC(12,2),
  monthly_net NUMERIC(12,2),
  -- Antworten auf den Fragebogen, Schluessel = offer_questions.key
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Dokument
  template_id UUID REFERENCES public.rgi_invoice_templates(id) ON DELETE SET NULL,
  docx_storage_path TEXT,
  pdf_storage_path TEXT,
  -- Nachverfolgung
  sent_on DATE, follow_up_on DATE, decided_on DATE, lost_reason TEXT,
  won_contract_id UUID REFERENCES public.management_contracts(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_offers_status ON public.offers(status);
CREATE INDEX idx_offers_follow_up ON public.offers(follow_up_on);

GRANT ALL ON public.offers TO service_role;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offers_admin_all" ON public.offers FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Angebotspositionen ============
CREATE TABLE public.offer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  fee_type TEXT,
  label TEXT NOT NULL,
  basis rgi_fee_basis NOT NULL DEFAULT 'case',
  amount NUMERIC(12,2),
  percent NUMERIC(6,3),
  quantity NUMERIC(12,2) DEFAULT 1,
  is_gross BOOLEAN NOT NULL DEFAULT false,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19,
  is_included BOOLEAN NOT NULL DEFAULT true,   -- abgewaehlte Position bleibt sichtbar
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_offer_items_offer ON public.offer_items(offer_id);

GRANT ALL ON public.offer_items TO service_role;
ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offer_items_admin_all" ON public.offer_items FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Fragenkatalog fuer Angebote ============
-- Neue Fragen kommen ohne Codeaenderung dazu.
CREATE TABLE public.offer_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  kind rgi_offer_question_kind NOT NULL DEFAULT 'text',
  options JSONB,
  help_text TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.offer_questions TO service_role;
ALTER TABLE public.offer_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offer_questions_admin_all" ON public.offer_questions FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

INSERT INTO public.offer_questions (key, label, kind, position) VALUES
  ('building_age',        'Wie alt ist das Gebaeude?',            'text',    10),
  ('renovation_backlog',  'Gibt es einen Sanierungsstau?',        'text',    20),
  ('change_reason',       'Was ist der Grund fuer den Wechsel?',  'text',    30);

-- ============ Objektbezug fuer Projekte und Rechnungen ============
-- Bisher hing der Objektbezug nur am Kunden. Damit laesst sich
-- auswerten, was ein Objekt jenseits des Grundhonorars eingebracht hat.
ALTER TABLE public.rgi_projects
  ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;
ALTER TABLE public.rgi_invoices
  ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rgi_projects_building ON public.rgi_projects(building_id);
CREATE INDEX IF NOT EXISTS idx_rgi_invoices_building ON public.rgi_invoices(building_id);

-- ============ Auswertung: Honorarbestand je Vertrag ============
-- Grundverguetung pro Monat, netto, aus den Bausteinen gerechnet.
CREATE OR REPLACE VIEW public.management_contract_summary AS
SELECT
  c.id                AS contract_id,
  c.building_id,
  b.name              AS building_name,
  b.building_code,
  b.management_mode,
  c.status,
  c.appointed_from,
  c.appointed_until,
  COALESCE(c.units_apartment, 0)  AS units_apartment,
  COALESCE(c.units_commercial, 0) AS units_commercial,
  COALESCE(c.units_parking, 0)    AS units_parking,
  COALESCE(c.units_other, 0)      AS units_other,
  COALESCE(SUM(
    CASE WHEN f.basis = 'unit_month' AND f.is_active
      THEN COALESCE(f.amount, 0) * COALESCE(f.quantity, 0)
           / CASE WHEN f.is_gross THEN (1 + f.vat_rate / 100) ELSE 1 END
    END
  ), 0)::numeric(12,2) AS base_monthly_net,
  COALESCE(SUM(
    CASE WHEN f.basis = 'monthly_flat' AND f.is_active
      THEN COALESCE(f.amount, 0)
           / CASE WHEN f.is_gross THEN (1 + f.vat_rate / 100) ELSE 1 END
    END
  ), 0)::numeric(12,2) AS flat_monthly_net
FROM public.management_contracts c
JOIN public.buildings b ON b.id = c.building_id
LEFT JOIN public.management_contract_fees f ON f.contract_id = c.id
GROUP BY c.id, b.name, b.building_code, b.management_mode;

-- security_invoker ist zwingend: ohne diese Einstellung laeuft die Sicht
-- mit den Rechten ihres Erstellers und umgeht die RLS der abfragenden
-- Person. Eigentuemer- und Mieter-Accounts koennten dann Honorardaten
-- lesen. Mit security_invoker gilt die Policy von management_contracts.
ALTER VIEW public.management_contract_summary SET (security_invoker = on);
GRANT SELECT ON public.management_contract_summary TO authenticated, service_role;

COMMENT ON TABLE public.management_contracts IS
  'Verwaltervertraege fuer WEG- und Mietverwaltung. Einheitenzahlen werden bewusst hier gefuehrt und nicht aus buildings.unit_count abgeleitet, weil Vertrag und Stammdaten auseinandergehen koennen.';
COMMENT ON TABLE public.billable_events IS
  'Abrechenbare Zusatzleistungen. Die monatliche Grundverguetung laeuft hier NICHT durch, sie wird als Selbstentnahme vom Objektkonto abgebucht.';
COMMENT ON COLUMN public.management_contracts.parking_billed_separately IS
  'false = Garagen und Stellplaetze sind im Satz je Wohneinheit enthalten und werden nicht separat verguetet.';
