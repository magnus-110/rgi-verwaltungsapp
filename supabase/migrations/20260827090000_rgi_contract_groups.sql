-- ============================================================
-- Sammelverträge und Rechnungsempfänger
--
-- Bisher galt: ein Vertrag gehört zu genau einem Objekt, und wer
-- das Honorar zahlt, steht nirgends. Für die WEG-Welt reicht das,
-- weil die Gemeinschaft zum Objekt gehört.
--
-- In der Mietverwaltung stimmt beides nicht. Der Vertrag mit
-- Einsiedler / Halblechkraftwerke / ECO umfasst 24 Liegenschaften
-- in einer Urkunde, und die Jahresrechnung geht an eine Firma,
-- nicht an ein Objekt.
--
-- Drei Teile:
--   1. Vertragsgruppe  — mehrere Objektverträge unter einer Urkunde
--   2. Rechnungsempfänger am Vertrag
--   3. Monatspauschale zählt im Abrechnungsblatt mit
-- ============================================================

-- ---------- 1. Vertragsgruppe ----------
CREATE TABLE IF NOT EXISTS public.management_contract_groups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  -- Wer die Rechnung bekommt. Ein Kunde kann mehrere Gruppen haben
  -- (Einsiedler und Halblechkraftwerke sind verschiedene Firmen).
  rgi_client_id  UUID REFERENCES public.rgi_clients(id) ON DELETE SET NULL,
  appointed_from DATE,
  appointed_until DATE,
  -- Die eine Urkunde, die für alle Objekte der Gruppe gilt.
  dms_file_id    UUID,
  notes          TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.management_contract_groups IS
  'Eine Vertragsurkunde ueber mehrere Objekte, typisch in der Mietverwaltung. Die einzelnen management_contracts haengen ueber group_id daran.';

ALTER TABLE public.management_contract_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS management_contract_groups_admin_all ON public.management_contract_groups;
CREATE POLICY management_contract_groups_admin_all
  ON public.management_contract_groups
  FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid()))
  WITH CHECK (public.rgi_is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_mcg_updated ON public.management_contract_groups;
CREATE TRIGGER trg_mcg_updated
  BEFORE UPDATE ON public.management_contract_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 2. Zuordnung am Vertrag ----------
ALTER TABLE public.management_contracts
  ADD COLUMN IF NOT EXISTS group_id UUID
    REFERENCES public.management_contract_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rgi_client_id UUID
    REFERENCES public.rgi_clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.management_contracts.group_id IS
  'Gesetzt, wenn dieser Objektvertrag Teil einer gemeinsamen Urkunde ist.';
COMMENT ON COLUMN public.management_contracts.rgi_client_id IS
  'Rechnungsempfaenger des Honorars. Leer heisst: geht an die WEG des Objekts.';

CREATE INDEX IF NOT EXISTS idx_management_contracts_group
  ON public.management_contracts(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_management_contracts_client
  ON public.management_contracts(rgi_client_id) WHERE rgi_client_id IS NOT NULL;

-- ---------- 3. Pauschale sichtbar machen ----------
-- Die Sicht zog bisher nur base_monthly_net, also die Bausteine mit
-- Preis je Einheit. Ein Vertrag mit reiner Monatspauschale (basis
-- 'monthly_flat') stand damit im Abrechnungsblatt auf null und waere
-- nie zur Abrechnung vorgeschlagen worden.
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
perioden AS (
  SELECT be.building_id, array_agg(DISTINCT be.period_key) AS billed_periods
  FROM public.billable_events be
  WHERE be.period_key IS NOT NULL AND be.status IN ('invoiced', 'settled')
  GROUP BY be.building_id
),
stunden AS (
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
  (COALESCE(s.base_monthly_net, 0) + COALESCE(s.flat_monthly_net, 0))::numeric(12,2)
                                          AS base_monthly_net,
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

ALTER VIEW public.rgi_building_billing_overview SET (security_invoker = on);
GRANT SELECT ON public.rgi_building_billing_overview TO authenticated, service_role;
