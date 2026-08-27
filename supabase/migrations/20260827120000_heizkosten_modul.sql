-- ============================================================================
-- Heizkostenmodul — Fundament
-- ============================================================================
--
-- Ermöglicht die eigene Heizkostenabrechnung nach HeizkostenV, statt sie bei
-- einem Messdienstleister einzukaufen. Die Ablesung bleibt beim Anbieter, die
-- Rechnung entsteht hier.
--
-- Aufbau:
--   heating_systems           Anlagendaten je Gebäude (Energieart, Schlüssel, Trennung)
--   heating_user_mapping      Nutzernummer des Messdienstes  ↔  Einheit der App
--   heating_devices           Gerätestamm (Zähler und Heizkostenverteiler)
--   heating_readings          Ablesewerte je Gerät und Zeitraum
--   heating_settlements       ein Rechenlauf mit Eingang, Ergebnis und Prüfprotokoll
--   heating_settlement_items  Ergebnis je Nutzeinheit, aufgeschlüsselt
--
-- Die bestehende Tabelle heating_distribution_values bleibt die Nahtstelle zur
-- Jahresabrechnung. Sie wird nur um die Aufschlüsselung erweitert; alles, was
-- heute daraus liest (WEG-Jahresabrechnung, Einzelabrechnung, Mieter-Neben-
-- kostenabrechnung), funktioniert unverändert weiter.
--
-- Alles in dieser Migration ist additiv. Keine bestehende Spalte wird
-- geändert oder entfernt.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1  heating_systems — die Anlage
-- ────────────────────────────────────────────────────────────────────────────
-- Ein Gebäude kann mehr als eine Anlage haben (Vilstalstr. 9 und 9a hängen in
-- der App an einem Gebäude, werden aber getrennt abgerechnet). Deshalb eine
-- eigene Tabelle statt Spalten auf buildings.

CREATE TABLE IF NOT EXISTS public.heating_systems (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id             uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  name                    text NOT NULL,

  -- Messdienstleister und dessen Anlagennummer. Die Anlagennummer ist der
  -- zuverlässigste Schlüssel, um ein hochgeladenes Dokument zuzuordnen.
  provider                text,
  provider_property_no    text,

  energy_source           text NOT NULL DEFAULT 'oil'
                            CHECK (energy_source IN ('oil','gas','pellets','district_heating','chp','wood','other')),

  -- Abrechnungsfläche. NICHT die Fläche aus der Teilungserklärung — die beiden
  -- Größen weichen im Bestand bei acht Liegenschaften voneinander ab.
  billing_area_m2         numeric,

  -- Warmwasser aus derselben Anlage (verbundene Anlage nach § 9)
  connected_hot_water     boolean NOT NULL DEFAULT true,

  -- Trennungsverfahren nach § 9 HeizkostenV
  --   wmz     Wärmemengenzähler (Abs. 2, Pflicht seit 31.12.2013)
  --   formel  Formel des Abs. 3 — nur zulässig ohne Wärmezähler, 15 % Kürzungsrecht
  --   fest    fester Prozentsatz (Altbestand, nur zur Nachrechnung fremder Abrechnungen)
  --   keine   kein Warmwasser aus der Anlage
  separation_method       text NOT NULL DEFAULT 'wmz'
                            CHECK (separation_method IN ('wmz','formel','fest','keine')),
  separation_fixed_share  numeric,
  formula_temperature_c   numeric NOT NULL DEFAULT 60,
  -- Ho/Hu-Umrechnung: Erdgas 1,11, sonst 1,00
  formula_calorific_factor numeric NOT NULL DEFAULT 1.0,

  -- Grundkostenanteile. Zulässig sind 0,30 bis 0,50 (= 50 bis 70 % Verbrauch)
  -- nach § 7 Abs. 1 und § 8 Abs. 1 HeizkostenV.
  heating_base_share      numeric NOT NULL DEFAULT 0.30,
  hotwater_base_share     numeric NOT NULL DEFAULT 0.30,

  -- Rundung des Warmwasseranteils vor der Anwendung auf die Kosten.
  -- Anbieterabhängig und für die Cent-Genauigkeit entscheidend.
  ww_share_rounding       text NOT NULL DEFAULT 'prozent2'
                            CHECK (ww_share_rounding IN ('prozent2','exakt')),

  is_active               boolean NOT NULL DEFAULT true,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heating_systems_building ON public.heating_systems(building_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_heating_systems_property_no
  ON public.heating_systems(provider, provider_property_no)
  WHERE provider_property_no IS NOT NULL;

COMMENT ON TABLE  public.heating_systems IS 'Anlagendaten für die eigene Heizkostenabrechnung nach HeizkostenV.';
COMMENT ON COLUMN public.heating_systems.billing_area_m2 IS 'Abrechnungsfläche nach HeizkostenV — nicht die Fläche aus der Teilungserklärung.';
COMMENT ON COLUMN public.heating_systems.ww_share_rounding IS 'prozent2 = Warmwasseranteil auf zwei Nachkommastellen in Prozent runden (RegioMess, BRUNATA); exakt = ungerundet weiterrechnen (Allgäu Messpartner).';


-- ────────────────────────────────────────────────────────────────────────────
-- 2  heating_user_mapping — Nutzernummer ↔ Einheit
-- ────────────────────────────────────────────────────────────────────────────
-- Die Nummerierung des Messdienstes stimmt NICHT mit der Einheitennummer der
-- App überein. In der Rudolfstr. 2e sind alle sechs Einheiten paarweise
-- vertauscht: Messdienst 001 = Moor, App 002 = Moor. Ohne diese Tabelle
-- bekäme jeder Bewohner die Abrechnung seines Nachbarn.

CREATE TABLE IF NOT EXISTS public.heating_user_mapping (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  heating_system_id     uuid NOT NULL REFERENCES public.heating_systems(id) ON DELETE CASCADE,

  provider_user_no      text NOT NULL,
  provider_external_no  text,
  provider_user_name    text,
  provider_location     text,

  assignment_id         uuid REFERENCES public.contact_building_assignments(id) ON DELETE SET NULL,
  unit_number           text,

  -- Wie sicher ist die Zuordnung?
  --   bestaetigt    von einem Menschen geprüft
  --   vorschlag     automatisch erkannt, noch nicht bestätigt
  --   unbestaetigt  keine Zuordnung gefunden
  confidence            text NOT NULL DEFAULT 'unbestaetigt'
                          CHECK (confidence IN ('bestaetigt','vorschlag','unbestaetigt')),
  matched_by            text,

  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (heating_system_id, provider_user_no)
);

CREATE INDEX IF NOT EXISTS idx_heating_user_mapping_assignment ON public.heating_user_mapping(assignment_id);

COMMENT ON TABLE public.heating_user_mapping IS 'Zuordnung Nutzernummer des Messdienstleisters zur Einheit der App. Die Nummern stimmen nicht überein — siehe Rudolfstr. 2e.';


-- ────────────────────────────────────────────────────────────────────────────
-- 3  heating_devices — Gerätestamm
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.heating_devices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  heating_system_id     uuid NOT NULL REFERENCES public.heating_systems(id) ON DELETE CASCADE,
  mapping_id            uuid REFERENCES public.heating_user_mapping(id) ON DELETE SET NULL,

  device_no             text NOT NULL,
  -- Fachliche Art des Geräts
  --   hkv  Heizkostenverteiler (misst Einheiten, braucht Bewertungsfaktor)
  --   wmz  Wärmemengenzähler   (misst MWh)
  --   wwz  Warmwasserzähler    (misst m³)
  --   kwz  Kaltwasserzähler    (misst m³)
  --   fbh  Fußbodenheizung ohne Gerät, rechnerisch ermittelt
  device_type           text NOT NULL CHECK (device_type IN ('hkv','wmz','wwz','kwz','fbh')),
  -- Kürzel des Anbieters im Original: RR, RV, PKKP, 2P3K, TH, DIA, HZK, HWK, RS …
  device_type_raw       text,

  room                  text,
  position              text,

  -- Bewertungsfaktor bei Heizkostenverteilern.
  rating_factor         numeric,
  -- Woher der Faktor stammt. Wichtig, weil das Zwischenableseprotokoll
  -- Faktoren unter 1 um eine Dezimalstelle verschoben druckt (0.088 = 0,88)
  -- und bei Funkgeräten vom Typ HZK gar keinen Faktor trägt.
  rating_factor_source  text CHECK (rating_factor_source IN
                          ('protokoll','protokoll_zehnerkorrektur','abrechnung','manuell','unbekannt')),

  -- Rechnerische Fußbodenheizung (§ 9a-nahe Ersatzermittlung, BRUNATA-Verfahren)
  fbh_area_m2           numeric,
  fbh_power_w_per_m2    numeric,
  fbh_load_factor       numeric,
  fbh_hours_per_day     numeric,
  fbh_days              integer,

  calibration_year      integer,
  calibration_valid_until date,

  installed_on          date,
  removed_on            date,
  is_active             boolean NOT NULL DEFAULT true,

  source_document       text,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heating_devices_system  ON public.heating_devices(heating_system_id);
CREATE INDEX IF NOT EXISTS idx_heating_devices_mapping ON public.heating_devices(mapping_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_heating_devices_unique
  ON public.heating_devices(heating_system_id, device_no, COALESCE(installed_on, DATE '1900-01-01'));

COMMENT ON COLUMN public.heating_devices.rating_factor_source IS 'protokoll_zehnerkorrektur = Wert aus dem Zwischenableseprotokoll, der als Faktor < 1 um eine Dezimalstelle verschoben gedruckt war und mit 10 multipliziert wurde.';


-- ────────────────────────────────────────────────────────────────────────────
-- 4  heating_settlements — der Rechenlauf
-- ────────────────────────────────────────────────────────────────────────────
-- Ein Lauf hält seine kompletten Eingangsdaten und sein Ergebnis fest. Damit
-- ist eine Abrechnung auch Jahre später nachvollziehbar, ohne dass sich das
-- Ergebnis ändert, wenn jemand später einen Stammdatensatz korrigiert.

CREATE TABLE IF NOT EXISTS public.heating_settlements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  heating_system_id   uuid NOT NULL REFERENCES public.heating_systems(id) ON DELETE CASCADE,
  building_id         uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  billing_period_id   uuid REFERENCES public.billing_periods(id) ON DELETE SET NULL,

  fiscal_year         integer NOT NULL,
  period_from         date NOT NULL,
  period_to           date NOT NULL,

  status              text NOT NULL DEFAULT 'entwurf'
                        CHECK (status IN ('entwurf','gerechnet','freigegeben','verworfen')),

  -- Vollständige Ein- und Ausgabe des Laufs als JSON, inklusive Rechenweg.
  input               jsonb,
  result              jsonb,
  checks              jsonb,

  total_costs         numeric,
  heating_costs       numeric,
  hotwater_costs      numeric,
  water_costs         numeric,
  ww_share            numeric,
  co2_kg              numeric,
  co2_costs           numeric,
  co2_owner_share     numeric,

  engine_version      text,

  calculated_at       timestamptz,
  calculated_by       uuid,
  released_at         timestamptz,
  released_by         uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heating_settlements_system ON public.heating_settlements(heating_system_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_heating_settlements_period ON public.heating_settlements(billing_period_id);
-- Je Anlage und Zeitraum darf höchstens ein Lauf freigegeben sein.
CREATE UNIQUE INDEX IF NOT EXISTS idx_heating_settlements_one_released
  ON public.heating_settlements(heating_system_id, period_from, period_to)
  WHERE status = 'freigegeben';


-- ────────────────────────────────────────────────────────────────────────────
-- 5  heating_readings — Ablesewerte
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.heating_readings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       uuid NOT NULL REFERENCES public.heating_devices(id) ON DELETE CASCADE,
  settlement_id   uuid REFERENCES public.heating_settlements(id) ON DELETE SET NULL,

  period_from     date NOT NULL,
  period_to       date NOT NULL,

  previous_value  numeric,
  current_value   numeric,
  -- Verbrauch. Bei Zählern current − previous, bei Heizkostenverteilern die
  -- abgelesene Anzeige; die Bewertung mit dem Faktor macht der Rechenkern.
  consumption     numeric,

  -- Ersatzwert nach § 9a HeizkostenV
  is_estimated    boolean NOT NULL DEFAULT false,
  estimate_level  smallint CHECK (estimate_level BETWEEN 1 AND 3),
  estimate_reason text,

  source          text CHECK (source IN ('upload','chat','manuell','portal','import')),
  source_document text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (device_id, period_from, period_to)
);

CREATE INDEX IF NOT EXISTS idx_heating_readings_settlement ON public.heating_readings(settlement_id);
CREATE INDEX IF NOT EXISTS idx_heating_readings_device     ON public.heating_readings(device_id, period_to);

COMMENT ON COLUMN public.heating_readings.estimate_level IS '§ 9a HeizkostenV: 1 = Vorjahresverbrauch derselben Einheit, 2 = Vergleichsräume, 3 = Durchschnitt des Gebäudes.';


-- ────────────────────────────────────────────────────────────────────────────
-- 6  heating_settlement_items — Ergebnis je Nutzeinheit
-- ────────────────────────────────────────────────────────────────────────────
-- Bei Nutzerwechsel entstehen mehrere Zeilen je Einheit, eine je Zeitraum.

CREATE TABLE IF NOT EXISTS public.heating_settlement_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id         uuid NOT NULL REFERENCES public.heating_settlements(id) ON DELETE CASCADE,
  mapping_id            uuid REFERENCES public.heating_user_mapping(id) ON DELETE SET NULL,
  assignment_id         uuid REFERENCES public.contact_building_assignments(id) ON DELETE SET NULL,

  unit_number           text,
  user_name             text,
  period_from           date,
  period_to             date,
  area_m2               numeric,

  heating_base          numeric NOT NULL DEFAULT 0,
  heating_consumption   numeric NOT NULL DEFAULT 0,
  hotwater_base         numeric NOT NULL DEFAULT 0,
  hotwater_consumption  numeric NOT NULL DEFAULT 0,
  water                 numeric NOT NULL DEFAULT 0,
  other                 numeric NOT NULL DEFAULT 0,
  total                 numeric NOT NULL DEFAULT 0,

  co2_kg                numeric,
  co2_tenant            numeric,
  co2_owner             numeric,

  -- Einzelposten und Rechenweg für die Abrechnung
  detail                jsonb,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heating_settlement_items_settlement ON public.heating_settlement_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_heating_settlement_items_assignment ON public.heating_settlement_items(assignment_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 7  heating_distribution_values erweitern
-- ────────────────────────────────────────────────────────────────────────────
-- amount bleibt die Gesamtsumme und damit unverändert die Zahl, die die
-- Jahresabrechnung verteilt. Die neuen Spalten tragen die Aufschlüsselung,
-- damit die Einzelabrechnung den Rechenweg zeigen kann.

ALTER TABLE public.heating_distribution_values
  ADD COLUMN IF NOT EXISTS heating_base         numeric,
  ADD COLUMN IF NOT EXISTS heating_consumption  numeric,
  ADD COLUMN IF NOT EXISTS hotwater_base        numeric,
  ADD COLUMN IF NOT EXISTS hotwater_consumption numeric,
  ADD COLUMN IF NOT EXISTS water                numeric,
  ADD COLUMN IF NOT EXISTS settlement_id        uuid REFERENCES public.heating_settlements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source               text NOT NULL DEFAULT 'messdienst';

COMMENT ON COLUMN public.heating_distribution_values.source IS 'messdienst = von Hand aus einer fremden Abrechnung übernommen; eigene_abrechnung = Ergebnis eines eigenen Rechenlaufs.';


-- ────────────────────────────────────────────────────────────────────────────
-- 8  Kostenart je Konto
-- ────────────────────────────────────────────────────────────────────────────
-- § 9 HeizkostenV verlangt die Trennung von Heizung und Warmwasser. Dafür muss
-- zu jeder Kostenposition bekannt sein, was sie betrifft. Die Messdienste
-- drucken das als H), W) und H/W) in jeder Zeile ihrer Kostenaufstellung.

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS heating_cost_type text
    CHECK (heating_cost_type IN ('heizung','warmwasser','beides'));

COMMENT ON COLUMN public.chart_of_accounts.heating_cost_type IS
  'Für die Trennung nach § 9 HeizkostenV: heizung = nur Heizung (H), warmwasser = nur Warmwasser (W), beides = gemeinsame Kosten (H/W), die nach dem Warmwasseranteil gequotelt werden.';

-- Startwerte nach dem üblichen Kontenrahmen. Einzelne Konten lassen sich
-- danach jederzeit in den Gebäudeeinstellungen umstellen.
UPDATE public.chart_of_accounts SET heating_cost_type = 'beides'
  WHERE heating_cost_type IS NULL AND account_number IN ('1400','1410','1430','1450','1460','1461','1431');
UPDATE public.chart_of_accounts SET heating_cost_type = 'heizung'
  WHERE heating_cost_type IS NULL AND account_number IN ('1420','1440');


-- ────────────────────────────────────────────────────────────────────────────
-- 9  Zugriffsschutz
-- ────────────────────────────────────────────────────────────────────────────
-- Gleiches Muster wie heating_distribution_values: nur Nutzer mit
-- Verwaltungszugang.

ALTER TABLE public.heating_systems           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heating_user_mapping      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heating_devices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heating_readings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heating_settlements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.heating_settlement_items  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'heating_systems','heating_user_mapping','heating_devices',
    'heating_readings','heating_settlements','heating_settlement_items'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.user_has_admin_access(auth.uid()))
         WITH CHECK (public.user_has_admin_access(auth.uid()))',
      t || '_admin_all', t);
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 10  updated_at automatisch pflegen
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.heizkosten_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $fn$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'heating_systems','heating_user_mapping','heating_devices',
    'heating_readings','heating_settlements'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_touch', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.heizkosten_touch_updated_at()',
      'trg_' || t || '_touch', t);
  END LOOP;
END $$;
