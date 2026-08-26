-- Werte, die beim Erzeugen des Vertragsentwurfs in die Platzhalter der
-- Word-Vorlage gehen und nicht aus offer_items kommen: Laufzeit,
-- Freigabegrenze, SEPA-Zuschlag, Entnahmetag, Beiratssitzungen,
-- Indexbasis, Anschrift und Vertretung der GdW.
-- Wird beim Anlegen eines Angebots mit den Standardwerten des aktuellen
-- RGI-Verwaltervertrags vorbelegt und ist danach frei aenderbar.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS contract_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS object_representative TEXT,
  ADD COLUMN IF NOT EXISTS land_register_ref TEXT;

COMMENT ON COLUMN public.offers.contract_defaults IS
  'Platzhalterwerte fuer den Vertragsentwurf, die nicht aus offer_items stammen. Schluessel entsprechen den Platzhaltern der Word-Vorlage, z. B. laufzeit.jahre oder freigabe.grenze.';
COMMENT ON COLUMN public.offers.object_representative IS
  'Wer die GdW vertritt, geht in den Platzhalter weg.vertreten_durch.';
COMMENT ON COLUMN public.offers.land_register_ref IS
  'Anschrift bzw. Grundbuchbezeichnung, geht in weg.anschrift.';

COMMENT ON COLUMN public.rgi_invoice_templates.template_kind IS
  'invoice | offer | contract - steuert, wofuer die Word-Vorlage angeboten wird.';

-- Die Angebotspositionen brauchen dieselben Grenzwerte wie die
-- Vertragsbausteine, sonst fehlen im erzeugten Vertragsentwurf der
-- Mindestbetrag beim Versicherungsschaden (§ 4 Ziff. 4) sowie Schwelle
-- und Mindestbetrag bei der Baubetreuung (§ 4 Ziff. 8).
ALTER TABLE public.offer_items
  ADD COLUMN IF NOT EXISTS threshold NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS min_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS max_count INTEGER,
  ADD COLUMN IF NOT EXISTS debtor rgi_fee_debtor NOT NULL DEFAULT 'community',
  ADD COLUMN IF NOT EXISTS halved_if_supervised BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.offer_items.threshold IS
  'Bemessungsgrundlage, ab der der Satz greift, z. B. Bausumme ab 5.000 EUR.';
COMMENT ON COLUMN public.offer_items.min_amount IS
  'Mindestbetrag, der unabhaengig vom Prozentsatz faellig wird.';
