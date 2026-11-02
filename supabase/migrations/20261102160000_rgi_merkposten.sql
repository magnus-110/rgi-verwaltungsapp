-- Merkposten im Abrechnungsblatt
--
-- Freie Positionen werden jetzt sofort als billable_events gespeichert
-- (source_kind = 'manual', Status 'approved') und bleiben stehen, bis
-- sie abgerechnet oder verworfen sind. Steht der Betrag noch nicht
-- fest, bleiben amount_net und amount_gross leer.
--
-- Die Objektübersicht zählt diese Merkposten zusätzlich gesondert,
-- damit man sieht, wo noch etwas vorgemerkt ist:
--   memo_count           offene, von Hand vorgemerkte Posten
--   memo_unpriced_count  davon ohne Betrag
-- Beide Spalten werden hinten angehängt; alles andere bleibt gleich.

CREATE OR REPLACE VIEW public.rgi_building_billing_overview AS
WITH offen AS (
  SELECT be.building_id,
         count(*) AS open_count,
         COALESCE(sum(
           COALESCE(be.amount_net,
                    be.amount_gross / (1 + COALESCE(be.vat_rate, 19) / 100),
                    0) * COALESCE(be.quantity, 1)
         ), 0) AS open_net,
         count(*) FILTER (WHERE be.source_kind = 'manual') AS memo_count,
         count(*) FILTER (WHERE be.source_kind = 'manual'
                            AND be.amount_net IS NULL
                            AND be.amount_gross IS NULL) AS memo_unpriced_count
  FROM public.billable_events be
  WHERE be.status IN ('detected', 'approved')
  GROUP BY be.building_id
), perioden AS (
  SELECT be.building_id,
         array_agg(DISTINCT be.period_key) AS billed_periods
  FROM public.billable_events be
  WHERE be.period_key IS NOT NULL
    AND be.status IN ('invoiced', 'settled')
  GROUP BY be.building_id
), stunden AS (
  SELECT p.building_id,
         (COALESCE(sum(t.minutes), 0)::numeric / 60.0)::numeric(12,2) AS open_hours,
         COALESCE(sum(t.minutes::numeric / 60.0
                      * COALESCE(t.hourly_rate, p.default_hourly_rate, p.client_rate, 0)), 0)::numeric(12,2)
           AS open_hours_net
  FROM (
    SELECT pr_1.id,
           pr_1.default_hourly_rate,
           COALESCE(pr_1.building_id, cl.building_id) AS building_id,
           cl.default_hourly_rate AS client_rate
    FROM public.rgi_projects pr_1
    LEFT JOIN public.rgi_clients cl ON cl.id = pr_1.client_id
  ) p
  JOIN public.rgi_time_entries t
    ON t.project_id = p.id AND t.invoice_item_id IS NULL AND t.billable
  WHERE p.building_id IS NOT NULL
  GROUP BY p.building_id
), letzte AS (
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
  (COALESCE(s.base_monthly_net, 0) + COALESCE(s.flat_monthly_net, 0))::numeric(12,2)
                                          AS base_monthly_net,
  COALESCE(o.open_count, 0)::int                  AS open_count,
  COALESCE(o.open_net, 0)::numeric(12,2)          AS open_net,
  COALESCE(h.open_hours, 0)::numeric(12,2)        AS open_hours,
  COALESCE(h.open_hours_net, 0)::numeric(12,2)    AS open_hours_net,
  COALESCE(pr.billed_periods, ARRAY[]::text[])    AS billed_periods,
  l.invoice_number                        AS last_invoice_number,
  l.issue_date                            AS last_invoice_date,
  l.total_gross                           AS last_invoice_gross,
  COALESCE(o.memo_count, 0)::int                  AS memo_count,
  COALESCE(o.memo_unpriced_count, 0)::int         AS memo_unpriced_count
FROM public.buildings b
LEFT JOIN LATERAL (
  SELECT mc.id, mc.status, mc.appointed_until
  FROM public.management_contracts mc
  WHERE mc.building_id = b.id
  ORDER BY (mc.status = 'active') DESC, mc.appointed_from DESC NULLS LAST
  LIMIT 1
) c ON true
LEFT JOIN public.management_contract_summary s ON s.contract_id = c.id
LEFT JOIN offen    o  ON o.building_id  = b.id
LEFT JOIN stunden  h  ON h.building_id  = b.id
LEFT JOIN perioden pr ON pr.building_id = b.id
LEFT JOIN letzte   l  ON l.building_id  = b.id;

ALTER VIEW public.rgi_building_billing_overview SET (security_invoker = on);
GRANT SELECT ON public.rgi_building_billing_overview TO authenticated, service_role;
