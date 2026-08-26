-- ============================================================
-- Abrechnungsblatt
--
-- Beantwortet je Liegenschaft zwei Fragen:
--   1. Was ist hier abrechenbar?
--   2. Habe ich es schon abgerechnet?
--
-- Die Tabelle billable_events gibt es seit dem 25.08. bereits,
-- sie hatte bisher nur keine Oberflaeche. Hier kommen die Felder
-- dazu, die eine Rechnungsposition braucht, sowie eine Sicht fuer
-- die Objektliste.
--
-- Grundsatz unveraendert: Automatik schlaegt vor, sie entscheidet nie.
-- ============================================================

-- ---------- Rechnung: Selbstentnahme statt Ueberweisung ----------
-- Das Honorar wird vom Objektkonto entnommen, die Rechnung ist Beleg
-- und keine Zahlungsaufforderung. Die Word-Vorlage wertet dieses
-- Kennzeichen als Platzhalter {entnahme} aus.
ALTER TABLE public.rgi_invoices
  ADD COLUMN IF NOT EXISTS paid_by_withdrawal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS withdrawn_on DATE;

COMMENT ON COLUMN public.rgi_invoices.paid_by_withdrawal IS
  'true = der Betrag wird per Selbstentnahme vom Objektkonto eingezogen. Die Word-Vorlage druckt dann den Entnahmehinweis statt der Bankverbindung und laesst das Zahlungsziel weg.';
COMMENT ON COLUMN public.rgi_invoices.withdrawn_on IS
  'Tag der tatsaechlichen Entnahme, falls abweichend vom Rechnungsdatum.';

-- ---------- Abrechenbare Posten: fehlende Felder ----------
ALTER TABLE public.billable_events
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS rgi_invoice_id UUID REFERENCES public.rgi_invoices(id) ON DELETE SET NULL;

-- amount_net war bisher nicht eindeutig dokumentiert. Verbindlich:
-- amount_net ist der EINZELPREIS, quantity die Menge. Der Zeilenbetrag
-- ist amount_net * quantity - genau wie bei rgi_invoice_items.
COMMENT ON COLUMN public.billable_events.amount_net IS
  'Einzelpreis netto. Zeilenbetrag = amount_net * quantity, analog zu rgi_invoice_items.unit_price_net.';
COMMENT ON COLUMN public.billable_events.amount_gross IS
  'Einzelpreis brutto, falls der Vertrag den Baustein brutto vereinbart. Wird beim Uebernehmen in die Rechnung auf netto umgerechnet.';
COMMENT ON COLUMN public.billable_events.unit IS
  'Einheit der Rechnungsposition, z. B. Std, Stueck, Monate, Vorgang.';
COMMENT ON COLUMN public.billable_events.period_key IS
  'Abrechnungszeitraum als Schluessel, z. B. 2025 fuer die jaehrliche Honorarrechnung oder 2025-03 fuer einen Monat. Verhindert zusammen mit fee_id, dass derselbe Zeitraum zweimal abgerechnet wird.';
COMMENT ON COLUMN public.billable_events.rgi_invoice_id IS
  'Rechnung, auf der dieser Posten steht. Redundant zu rgi_invoice_item_id, aber die Uebersicht braucht die Rechnungsnummer ohne zweiten Join.';

-- Derselbe Vertragsbaustein darf denselben Zeitraum nur einmal
-- erzeugen. Verworfene Posten bleiben ausgenommen, damit ein
-- Fehleintrag korrigiert werden kann.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billable_events_period
  ON public.billable_events(building_id, fee_id, period_key)
  WHERE period_key IS NOT NULL AND status <> 'dismissed';

CREATE INDEX IF NOT EXISTS idx_billable_events_invoice
  ON public.billable_events(rgi_invoice_id);

-- ---------- Objektliste: was liegt an? ----------
-- Eine Zeile je Gebaeude mit offenen Posten, Honorarbestand und
-- der zuletzt gestellten Rechnung.
CREATE OR REPLACE VIEW public.rgi_building_billing_overview AS
WITH offen AS (
  SELECT
    be.building_id,
    count(*)                                             AS open_count,
    COALESCE(SUM(
      COALESCE(
        be.amount_net,
        be.amount_gross / (1 + COALESCE(be.vat_rate, 19) / 100),
        0
      ) * COALESCE(be.quantity, 1)
    ), 0)                                                AS open_net
  FROM public.billable_events be
  WHERE be.status IN ('detected', 'approved')
  GROUP BY be.building_id
),
letzte AS (
  SELECT DISTINCT ON (i.building_id)
    i.building_id, i.invoice_number, i.issue_date, i.total_gross
  FROM public.rgi_invoices i
  WHERE i.building_id IS NOT NULL AND i.invoice_number IS NOT NULL
  ORDER BY i.building_id, i.issue_date DESC, i.created_at DESC
)
SELECT
  b.id                                    AS building_id,
  b.name                                  AS building_name,
  b.building_code,
  b.city,
  b.management_mode,
  c.id                                    AS contract_id,
  c.status                                AS contract_status,
  c.appointed_until,
  COALESCE(s.base_monthly_net, 0)::numeric(12,2)  AS base_monthly_net,
  COALESCE(o.open_count, 0)::int                  AS open_count,
  COALESCE(o.open_net, 0)::numeric(12,2)          AS open_net,
  l.invoice_number                        AS last_invoice_number,
  l.issue_date                            AS last_invoice_date,
  l.total_gross                           AS last_invoice_gross
FROM public.buildings b
LEFT JOIN LATERAL (
  -- Der laufende Vertrag zuerst, sonst die juengste Fassung.
  SELECT mc.id, mc.status, mc.appointed_until
  FROM public.management_contracts mc
  WHERE mc.building_id = b.id
  ORDER BY (mc.status = 'active') DESC, mc.appointed_from DESC NULLS LAST
  LIMIT 1
) c ON true
LEFT JOIN public.management_contract_summary s ON s.contract_id = c.id
LEFT JOIN offen  o ON o.building_id = b.id
LEFT JOIN letzte l ON l.building_id = b.id;

-- security_invoker ist zwingend: ohne diese Einstellung laeuft die
-- Sicht mit den Rechten ihres Erstellers und umgeht die RLS der
-- abfragenden Person. Eigentuemer- und Mieter-Accounts koennten dann
-- Honorardaten lesen.
ALTER VIEW public.rgi_building_billing_overview SET (security_invoker = on);
GRANT SELECT ON public.rgi_building_billing_overview TO authenticated, service_role;

COMMENT ON VIEW public.rgi_building_billing_overview IS
  'Einstieg in das Abrechnungsblatt: je Liegenschaft die Zahl und Summe der offenen Posten, der monatliche Honorarbestand und die zuletzt gestellte Rechnung.';
