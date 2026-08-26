-- Der aktuelle RGI-Verwaltervertrag rechnet die Baubetreuung nach einer
-- Staffel ab: bis 25.000,00 EUR 5,0 %, von 25.000,01 bis 100.000,00 EUR
-- 4,0 %, darueber 2,5 %. Ein einzelner Prozentsatz je Baustein kann das
-- nicht abbilden, deshalb bekommt jeder Baustein Staffelgrenzen.
-- Mehrere Bausteine desselben fee_type bilden dann die Stufen.
ALTER TABLE public.management_contract_fees
  ADD COLUMN IF NOT EXISTS tier_from NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS tier_to NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS halved_if_supervised BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.management_contract_fees.tier_from IS
  'Untergrenze der Staffelstufe (Bemessungsgrundlage), NULL = ab null.';
COMMENT ON COLUMN public.management_contract_fees.tier_to IS
  'Obergrenze der Staffelstufe, NULL = nach oben offen.';
COMMENT ON COLUMN public.management_contract_fees.halved_if_supervised IS
  'Verguetung halbiert sich, wenn ein Architekt oder Sonderfachmann die Objektueberwachung uebernimmt (HOAI Leistungsphase 8).';

ALTER TABLE public.offer_items
  ADD COLUMN IF NOT EXISTS tier_from NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS tier_to NUMERIC(12,2);

-- Der Fragenkatalog fuer Angebote wird um die Felder erweitert, die sich
-- als Entscheidungsgrundlage bewaehrt haben.
INSERT INTO public.offer_questions (key, label, kind, position) VALUES
  ('owner_count',      'Wie viele Eigentuemer sind es?',        'number', 40),
  ('legal_disputes',   'Laufen aktuell Rechtsstreitigkeiten?',  'text',   50),
  ('bookkeeping_state','Wie ist der Zustand der Buchhaltung?',  'text',   60),
  ('previous_fee',     'Was zahlt die WEG bisher?',             'text',   70)
ON CONFLICT (key) DO NOTHING;
