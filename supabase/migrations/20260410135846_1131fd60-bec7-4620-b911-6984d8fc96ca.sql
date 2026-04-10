
CREATE TABLE public.booking_template_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  vendor_name TEXT DEFAULT '',
  category TEXT DEFAULT '',
  interval TEXT DEFAULT 'monatlich',
  vat_rate NUMERIC DEFAULT NULL,
  is_35a_relevant BOOLEAN DEFAULT false,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_template_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view presets"
  ON public.booking_template_presets FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert presets"
  ON public.booking_template_presets FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update presets"
  ON public.booking_template_presets FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete presets"
  ON public.booking_template_presets FOR DELETE
  TO authenticated USING (true);

INSERT INTO public.booking_template_presets (name, vendor_name, category, interval, vat_rate, is_35a_relevant, description, sort_order) VALUES
  ('Stromabschlag', '', 'Betriebskosten', 'monatlich', 19, false, 'Monatliche Abschlagszahlung Strom', 1),
  ('Gasabschlag', '', 'Betriebskosten', 'monatlich', 19, false, 'Monatliche Abschlagszahlung Gas/Heizung', 2),
  ('Wasserabschlag', '', 'Betriebskosten', 'monatlich', 7, false, 'Monatliche Abschlagszahlung Wasser/Abwasser', 3),
  ('Grundsteuer', 'Gemeinde', 'Betriebskosten', 'quartalsweise', NULL, false, 'Quartalsweise Grundsteuer an die Gemeinde', 4),
  ('Müllabfuhr', '', 'Betriebskosten', 'quartalsweise', NULL, false, 'Müllgebühren', 5),
  ('Gebäudeversicherung', '', 'Versicherung', 'jährlich', 19, false, 'Gebäudeversicherung (Feuer, Sturm, Wasser)', 6),
  ('Haftpflichtversicherung', '', 'Versicherung', 'jährlich', 19, false, 'Haus- und Grundbesitzer-Haftpflicht', 7),
  ('Hausmeisterservice', '', 'Dienstleistung', 'monatlich', 19, true, 'Hausmeister/Hauswart', 8),
  ('Treppenhausreinigung', '', 'Dienstleistung', 'monatlich', 19, true, 'Reinigung Treppenhaus/Gemeinschaftsflächen', 9),
  ('Winterdienst', '', 'Dienstleistung', 'monatlich', 19, true, 'Winterdienst/Schneeräumung', 10),
  ('Aufzugswartung', '', 'Wartung', 'quartalsweise', 19, true, 'Wartung und Prüfung Aufzug', 11),
  ('Kontoführungsgebühr', '', 'Verwaltung', 'monatlich', NULL, false, 'Bankgebühren für das Hausgeldkonto', 12),
  ('Schornsteinfeger', '', 'Dienstleistung', 'jährlich', 19, true, 'Schornsteinfeger / Abgasmessung', 13),
  ('Kabelanschluss/Internet', '', 'Betriebskosten', 'monatlich', 19, false, 'Kabelanschluss / Glasfaser / Internet', 14),
  ('Verwaltergebühr', '', 'Verwaltung', 'monatlich', 19, false, 'Hausverwaltungsgebühr', 15),
  ('Gartenpflege', '', 'Dienstleistung', 'monatlich', 19, true, 'Gartenpflege / Grünanlagen', 16);
