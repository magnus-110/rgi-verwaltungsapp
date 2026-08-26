-- ============================================================
-- Der Stapel "Abzurechnen" im Rechnungslauf braucht mehr als die
-- schon erfassten Posten. Sonst bliebe er leer, bis jemand von Hand
-- etwas anhakt - und genau das soll er ja anstossen.
--
-- Neu in der Sicht:
--   * offene Stunden (ueber Projekte des Objekts ODER seiner Kunden)
--   * welche Honorarjahre schon abgerechnet sind
--
-- Die Sicht wird neu angelegt statt ersetzt: CREATE OR REPLACE kann
-- keine Spalten in der Mitte einfuegen.
-- ============================================================
DROP VIEW IF EXISTS public.rgi_building_billing_overview;

CREATE VIEW public.rgi_building_billing_overview AS
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
perioden AS (
  -- Zeitraeume, die bereits auf einer Rechnung stehen. Damit weiss
  -- die Oberflaeche, ob das Honorarjahr noch offen ist.
  SELECT be.building_id, array_agg(DISTINCT be.period_key) AS billed_periods
  FROM public.billable_events be
  WHERE be.period_key IS NOT NULL AND be.status IN ('invoiced', 'settled')
  GROUP BY be.building_id
),
stunden AS (
  -- Ein Projekt haengt direkt oder ueber seinen Kunden am Objekt.
  -- Der Stundensatz faellt zurueck: Eintrag, Projekt, Kunde.
  SELECT
    p.building_id,
    (COALESCE(SUM(t.minutes), 0) / 60.0)::numeric(12,2) AS open_hours,
    COALESCE(SUM(
      (t.minutes / 60.0) *
      COALESCE(t.hourly_rate, p.default_hourly_rate, p.client_rate, 0)
    ), 0)::numeric(12,2) AS open_hours_net
  FROM (
    SELECT pr.id, pr.default_hourly_rate,
           COALESCE(pr.building_id, cl.building_id) AS building_id,
           cl.default_hourly_rate AS client_rate
    FROM public.rgi_projects pr
    LEFT JOIN public.rgi_clients cl ON cl.id = pr.client_id
  ) p
  JOIN public.rgi_time_entries t
    ON t.project_id = p.id AND t.invoice_item_id IS NULL AND t.billable
  WHERE p.building_id IS NOT NULL
  GROUP BY p.building_id
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
  COALESCE(h.open_hours, 0)::numeric(12,2)        AS open_hours,
  COALESCE(h.open_hours_net, 0)::numeric(12,2)    AS open_hours_net,
  COALESCE(pr.billed_periods, ARRAY[]::text[])    AS billed_periods,
  l.invoice_number                        AS last_invoice_number,
  l.issue_date                            AS last_invoice_date,
  l.total_gross                           AS last_invoice_gross
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

-- security_invoker ist zwingend: ohne diese Einstellung laeuft die
-- Sicht mit den Rechten ihres Erstellers und umgeht die RLS der
-- abfragenden Person. Eigentuemer- und Mieter-Accounts koennten dann
-- Honorardaten lesen.
ALTER VIEW public.rgi_building_billing_overview SET (security_invoker = on);
GRANT SELECT ON public.rgi_building_billing_overview TO authenticated, service_role;

COMMENT ON VIEW public.rgi_building_billing_overview IS
  'Einstieg in den Rechnungslauf: je Liegenschaft die offenen Posten, die offenen Stunden, die bereits abgerechneten Honorarjahre, der monatliche Honorarbestand und die zuletzt gestellte Rechnung.';
