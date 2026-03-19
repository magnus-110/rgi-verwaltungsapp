
-- 1. Chart of Accounts (global)
CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text NOT NULL UNIQUE,
  account_name text NOT NULL,
  category text NOT NULL,
  default_distribution_key text,
  is_35a_relevant boolean DEFAULT false,
  is_system_account boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and employees can manage chart of accounts" ON public.chart_of_accounts FOR ALL USING (user_has_admin_access(auth.uid()));

-- 2. Building Account Overrides
CREATE TABLE public.building_account_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  distribution_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(building_id, account_id)
);

ALTER TABLE public.building_account_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and employees can manage building account overrides" ON public.building_account_overrides FOR ALL USING (user_has_admin_access(auth.uid()));

-- 3. Invoices
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  invoice_number text,
  vendor_name text,
  invoice_date date,
  due_date date,
  gross_amount numeric,
  net_amount numeric,
  vat_amount numeric,
  description text,
  status text NOT NULL DEFAULT 'open',
  file_path text,
  ocr_raw_data jsonb,
  ocr_extracted_data jsonb,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and employees can manage invoices" ON public.invoices FOR ALL USING (user_has_admin_access(auth.uid()));

-- 4. Bookings
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  booking_date date NOT NULL,
  amount numeric NOT NULL,
  description text,
  fiscal_year integer NOT NULL,
  performance_period_from date,
  performance_period_to date,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and employees can manage bookings" ON public.bookings FOR ALL USING (user_has_admin_access(auth.uid()));

-- updated_at triggers
CREATE TRIGGER update_chart_of_accounts_updated_at BEFORE UPDATE ON public.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_building_account_overrides_updated_at BEFORE UPDATE ON public.building_account_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: Chart of Accounts (~90 accounts from Excel)
INSERT INTO public.chart_of_accounts (account_number, account_name, category, default_distribution_key, is_35a_relevant, is_system_account, sort_order) VALUES
-- 0. Personenkonten
('00000', 'Eigentümer- und Hausgeldkonten', '0. Personenkonten', 'direkt', false, true, 1),
('M0000', '--- Mieteinnahmen --- (Titelkonto)', '0. Personenkonten', null, false, true, 2),
('M0001', 'Mieterkonten (individuell)', '0. Personenkonten', 'direkt', false, true, 3),
-- 1. Umlagefähige Betriebskosten
('1000', 'Straßenreinigung', '1. Umlagefähige Betriebskosten', 'mea', true, true, 10),
('1010', 'Müllabfuhr / Restmüll / Grundgebühren', '1. Umlagefähige Betriebskosten', 'personen', false, true, 11),
('1011', 'Papiertonne', '1. Umlagefähige Betriebskosten', 'personen', false, true, 12),
('1012', 'Blaue Tonne', '1. Umlagefähige Betriebskosten', 'personen', false, true, 13),
('1013', 'Gewerbemüll', '1. Umlagefähige Betriebskosten', 'personen', false, true, 14),
('1030', 'Wasserversorgung & Entwässerung', '1. Umlagefähige Betriebskosten', 'verbrauch_wasser', false, true, 15),
('1031', 'Wasserversorgung (Vermieteranteil / Leerstand)', '1. Umlagefähige Betriebskosten', 'verbrauch_wasser', false, true, 16),
('1040', 'Abwasser / Kanal', '1. Umlagefähige Betriebskosten', 'verbrauch_wasser', false, true, 17),
('1050', 'Allgemeinstrom / Beleuchtung', '1. Umlagefähige Betriebskosten', 'mea', false, true, 18),
('1051', 'Allgemeinstrom (Vermieteranteil / Leerstand)', '1. Umlagefähige Betriebskosten', 'mea', false, true, 19),
('1060', 'Hausmeister (Rechnungen / Dienstleister)', '1. Umlagefähige Betriebskosten', 'mea', true, true, 20),
('1061', 'Winterdienst / Schneeräumung', '1. Umlagefähige Betriebskosten', 'mea', true, true, 21),
('1070', 'Hausreinigung', '1. Umlagefähige Betriebskosten', 'mea', true, true, 22),
('1080', 'Gartenpflege / Grünanlagen', '1. Umlagefähige Betriebskosten', 'mea', true, true, 23),
('1090', 'Ungezieferbekämpfung / Rattenköder', '1. Umlagefähige Betriebskosten', 'mea', false, true, 24),
('1100', 'Wartung (Allgemein / Sonstige)', '1. Umlagefähige Betriebskosten', 'mea', true, true, 25),
('1101', 'Wartung Feuerlöscher', '1. Umlagefähige Betriebskosten', 'mea', true, true, 26),
('1102', 'Wartung Rauchwarnmelder', '1. Umlagefähige Betriebskosten', 'mea', true, true, 27),
('1103', 'Aufzugskosten Wartung', '1. Umlagefähige Betriebskosten', 'mea', true, true, 28),
('1104', 'Aufzugskosten Notruf', '1. Umlagefähige Betriebskosten', 'mea', false, true, 29),
('1110', 'Verbrauchsmaterial (Streugut, Grüngut, Kleinmaterial)', '1. Umlagefähige Betriebskosten', 'mea', false, true, 30),
('1120', 'Breitband / Kabelgebühren', '1. Umlagefähige Betriebskosten', 'einheiten', false, true, 31),
('1130', 'Dachrinnenreinigung', '1. Umlagefähige Betriebskosten', 'mea', true, true, 32),
('1200', 'Grundsteuer', '1. Umlagefähige Betriebskosten', 'mea', false, true, 33),
('1300', 'Versicherungen (Hauptkonto / Sonstige)', '1. Umlagefähige Betriebskosten', 'mea', false, true, 34),
('1301', 'Gebäudebrandversicherung / Elementar', '1. Umlagefähige Betriebskosten', 'mea', false, true, 35),
('1302', 'Sach- und Haftpflichtversicherung', '1. Umlagefähige Betriebskosten', 'mea', false, true, 36),
('1303', 'Gewässerschadenversicherung', '1. Umlagefähige Betriebskosten', 'mea', false, true, 37),
-- 2. Heizung & Warme BK
('1400', 'Heizung / Warmwasser (Hauptkonto)', '2. Heizung & Warme BK', 'heizkostenverordnung', false, true, 40),
('1410', 'Brennstoffkauf (Gas, Öl, Pellets)', '2. Heizung & Warme BK', 'heizkostenverordnung', false, true, 41),
('1420', 'Kaminkehrer (Heizung)', '2. Heizung & Warme BK', 'heizkostenverordnung', false, true, 42),
('1430', 'Heiz-Nebenkosten / Messdienst', '2. Heizung & Warme BK', 'heizkostenverordnung', true, true, 43),
('1431', 'Gerätemiete / Zählermiete', '2. Heizung & Warme BK', 'mea', false, true, 44),
('1440', 'Heizungswartung', '2. Heizung & Warme BK', 'heizkostenverordnung', true, true, 45),
('1450', 'Heizölrestbestand / Brennstoffrestbestand', '2. Heizung & Warme BK', 'heizkostenverordnung', false, true, 46),
('1460', 'CO2-Umlage', '2. Heizung & Warme BK', 'mea', false, true, 47),
('1461', 'CO2-Umlage (Anteil Vermieter)', '2. Heizung & Warme BK', 'mea', false, true, 48),
-- 3. Verwaltung & Instandhaltung
('1500', 'Verwaltervergütung (Hauptgebäude)', '3. Verwaltung & Instandhaltung', 'einheiten', false, true, 50),
('1501', 'Verwaltervergütung TG', '3. Verwaltung & Instandhaltung', 'einheiten', false, true, 51),
('1502', 'Außerordentliche Verwaltungskosten', '3. Verwaltung & Instandhaltung', 'mea', false, true, 52),
('1503', 'Verwaltervergütung Miete / SEV', '3. Verwaltung & Instandhaltung', 'einheiten', false, true, 53),
('1510', 'Porto / Telefon / Bürobedarf', '3. Verwaltung & Instandhaltung', 'mea', false, true, 54),
('1520', 'Kontogebühren / Bankgebühren', '3. Verwaltung & Instandhaltung', 'mea', false, true, 55),
('1530', 'Rechts- und Beratungskosten / Anwalt / Gericht', '3. Verwaltung & Instandhaltung', 'mea', false, true, 56),
('1540', 'Mahngebühren', '3. Verwaltung & Instandhaltung', 'mea', false, true, 57),
('1580', 'Lohnnebenkosten / Knappschaft', '3. Verwaltung & Instandhaltung', 'mea', false, true, 58),
('1581', 'Steuer / Berufsgenossenschaft', '3. Verwaltung & Instandhaltung', 'mea', false, true, 59),
('1600', 'Laufende Instandhaltung / Reparaturen', '3. Verwaltung & Instandhaltung', 'mea', true, true, 60),
('1601', 'Besondere Instandhaltung (Großprojekte)', '3. Verwaltung & Instandhaltung', 'mea', true, true, 61),
('1602', 'Kleinreparaturen', '3. Verwaltung & Instandhaltung', 'mea', true, true, 62),
('1603', 'Mieterwechselkosten / Schönheitsreparaturen', '3. Verwaltung & Instandhaltung', 'mea', true, true, 63),
('1610', 'Handwerkerlöhne / Dienste lt. §35a EStG', '3. Verwaltung & Instandhaltung', 'mea', false, true, 64),
-- 4. WEG-Systemkonten & Rücklagen
('1700', 'Summe I. Bewirtschaftungskosten', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 70),
('1710', 'II. Beitragsverpflichtung IHR', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 71),
('1730', 'Summe II. Beitrag IHR', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 72),
('1740', 'III. Einnahmen der WEG', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 73),
('1770', 'Summe III. Einnahmen', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 74),
('1780', 'Altschulden aus Abrechnung', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 75),
('1800', 'Laufendes Bankkonto / Giro', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 76),
('1810', 'Rücklagenkonto / Festgeld / Sparbuch', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 77),
('1840', 'Zinseinnahmen / Zinserträge', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 78),
('1850', 'Kapitalertragssteuer', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 79),
('1860', 'Solidaritätszuschlag', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 80),
('1900', '--- Mitteilungskonten ---', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 81),
('1910', 'Stand der Rücklage', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 82),
('1920', 'Reparaturen aus Entnahme Rücklage', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 83),
('1930', 'Planmäßige IHR Wohnungen', '4. WEG-Systemkonten & Rücklagen', 'mea', false, true, 84),
-- 5. Eröffnungen & Abgrenzung
('4000', 'Eröffnungsbuchungen', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 90),
('4010', 'Irrläufer-Konto / Prüfen', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 91),
('4020', 'WEG-Abrechnung Sollstellung', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 92),
('4021', 'Ausgleich NK-Jahresabrechnung', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 93),
('4025', 'Mietausfallwagnis / Leerstandsverlust', '5. Eröffnungen & Abgrenzung', 'direkt', false, true, 94),
('4030', 'Durchlaufkonto', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 95),
('4040', 'Ausweis für §35a EStG', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 96),
('4100', '--- Abgrenzung ---', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 97),
('4110', 'Ausgaben im lfd. Jahr für Vorjahr', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 98),
('4120', 'Ausgaben im lfd. Jahr für Folgejahr', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 99),
('4130', 'Einnahmen im lfd. Jahr für Vorjahr', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 100),
('4140', 'Einnahmen im lfd. Jahr für Folgejahr', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 101),
('4150', 'Ausgaben im Vorjahr für lfd. Jahr', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 102),
('4160', 'Ausgaben im Folgejahr für lfd. Jahr', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 103),
('4170', 'Einnahmen im Vorjahr für lfd. Jahr', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 104),
('4180', 'Einnahmen im Folgejahr für lfd. Jahr', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 105),
('7100', '§35a Abs. 2 Satz 1 EStG Mieterbescheinigung', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 110),
('7120', '§35a Abs. 3 Satz 1 EStG Mieterbescheinigung', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 111),
('9000', '--- NK-Einnahmen ---', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 112),
('09999.998', '--- Summe Hausgelder ---', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 113),
('09999.999', 'I. Bewirtschaftungskosten', '5. Eröffnungen & Abgrenzung', 'mea', false, true, 114);

-- Storage bucket for invoices
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false);
CREATE POLICY "Admins can manage invoice files" ON storage.objects FOR ALL USING (bucket_id = 'invoices' AND user_has_admin_access(auth.uid()));
