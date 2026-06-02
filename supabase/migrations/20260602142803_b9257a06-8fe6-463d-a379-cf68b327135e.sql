
-- Enums
CREATE TYPE rgi_client_type AS ENUM ('contact', 'building', 'free');
CREATE TYPE rgi_sparte AS ENUM ('weg', 'rent', 'sales', 'letting', 'other');
CREATE TYPE rgi_project_status AS ENUM ('active', 'paused', 'closed');
CREATE TYPE rgi_invoice_status AS ENUM ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled');
CREATE TYPE rgi_invoice_item_kind AS ENUM ('time', 'flat', 'material', 'text');

-- Helper: is current user RGI admin
CREATE OR REPLACE FUNCTION public.rgi_is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role(_user_id) = 'admin'::app_role
$$;
GRANT EXECUTE ON FUNCTION public.rgi_is_admin(uuid) TO authenticated;

-- ============ Company Settings (Singleton) ============
CREATE TABLE public.rgi_company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL DEFAULT 'RGI Immobilien',
  address_line1 TEXT, address_line2 TEXT, zip TEXT, city TEXT, country TEXT DEFAULT 'DE',
  tax_no TEXT, vat_id TEXT, ceo TEXT, hrb TEXT, court TEXT,
  iban TEXT, bic TEXT, bank_name TEXT,
  email TEXT, phone TEXT, website TEXT,
  invoice_number_pattern TEXT NOT NULL DEFAULT '{YYYY}-{NNNN}',
  default_payment_terms_days INTEGER NOT NULL DEFAULT 14,
  default_footer_text TEXT,
  reminder_fee_l1 NUMERIC(10,2) DEFAULT 5.00,
  reminder_fee_l2 NUMERIC(10,2) DEFAULT 10.00,
  reminder_fee_l3 NUMERIC(10,2) DEFAULT 20.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_company_settings TO authenticated;
GRANT ALL ON public.rgi_company_settings TO service_role;
ALTER TABLE public.rgi_company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_company_settings_admin_all" ON public.rgi_company_settings FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));
INSERT INTO public.rgi_company_settings (legal_name) VALUES ('RGI Immobilien');

-- ============ Clients ============
CREATE TABLE public.rgi_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type rgi_client_type NOT NULL DEFAULT 'free',
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  address_line1 TEXT, address_line2 TEXT, zip TEXT, city TEXT, country TEXT DEFAULT 'DE',
  email TEXT, vat_id TEXT, customer_no TEXT,
  default_payment_terms_days INTEGER, default_hourly_rate NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_rgi_clients_contact ON public.rgi_clients(contact_id);
CREATE INDEX idx_rgi_clients_building ON public.rgi_clients(building_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_clients TO authenticated;
GRANT ALL ON public.rgi_clients TO service_role;
ALTER TABLE public.rgi_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_clients_admin_all" ON public.rgi_clients FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Projects ============
CREATE TABLE public.rgi_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.rgi_clients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sparte rgi_sparte NOT NULL DEFAULT 'other',
  status rgi_project_status NOT NULL DEFAULT 'active',
  default_hourly_rate NUMERIC(10,2),
  notes TEXT,
  started_at DATE DEFAULT CURRENT_DATE,
  closed_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_rgi_projects_client ON public.rgi_projects(client_id);
CREATE INDEX idx_rgi_projects_sparte ON public.rgi_projects(sparte);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_projects TO authenticated;
GRANT ALL ON public.rgi_projects TO service_role;
ALTER TABLE public.rgi_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_projects_admin_all" ON public.rgi_projects FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Invoice Templates ============
CREATE TABLE public.rgi_invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sparte rgi_sparte,
  storage_path TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  template_kind TEXT NOT NULL DEFAULT 'invoice',
  placeholder_schema JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_invoice_templates TO authenticated;
GRANT ALL ON public.rgi_invoice_templates TO service_role;
ALTER TABLE public.rgi_invoice_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_invoice_templates_admin_all" ON public.rgi_invoice_templates FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Invoice Sequences ============
CREATE TABLE public.rgi_invoice_sequences (
  scope TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_no INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_invoice_sequences TO authenticated;
GRANT ALL ON public.rgi_invoice_sequences TO service_role;
ALTER TABLE public.rgi_invoice_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_invoice_sequences_admin_all" ON public.rgi_invoice_sequences FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Invoices ============
CREATE TABLE public.rgi_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.rgi_clients(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES public.rgi_projects(id) ON DELETE SET NULL,
  invoice_number TEXT UNIQUE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  service_period_from DATE,
  service_period_to DATE,
  status rgi_invoice_status NOT NULL DEFAULT 'draft',
  client_name_snapshot TEXT,
  client_address_snapshot TEXT,
  subtotal_net NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  intro_text TEXT,
  footer_text TEXT,
  template_id UUID REFERENCES public.rgi_invoice_templates(id) ON DELETE SET NULL,
  docx_storage_path TEXT,
  pdf_storage_path TEXT,
  cancels_invoice_id UUID REFERENCES public.rgi_invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);
CREATE INDEX idx_rgi_invoices_client ON public.rgi_invoices(client_id);
CREATE INDEX idx_rgi_invoices_project ON public.rgi_invoices(project_id);
CREATE INDEX idx_rgi_invoices_status ON public.rgi_invoices(status);
CREATE INDEX idx_rgi_invoices_issue_date ON public.rgi_invoices(issue_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_invoices TO authenticated;
GRANT ALL ON public.rgi_invoices TO service_role;
ALTER TABLE public.rgi_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_invoices_admin_all" ON public.rgi_invoices FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Invoice Items ============
CREATE TABLE public.rgi_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.rgi_invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  kind rgi_invoice_item_kind NOT NULL DEFAULT 'flat',
  description TEXT NOT NULL,
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'pauschal',
  unit_price_net NUMERIC(12,4) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19,
  line_net NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_vat NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  source_time_entry_ids UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rgi_invoice_items_invoice ON public.rgi_invoice_items(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_invoice_items TO authenticated;
GRANT ALL ON public.rgi_invoice_items TO service_role;
ALTER TABLE public.rgi_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_invoice_items_admin_all" ON public.rgi_invoice_items FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Time Entries ============
CREATE TABLE public.rgi_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.rgi_projects(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  description TEXT NOT NULL,
  hourly_rate NUMERIC(10,2),
  billable BOOLEAN NOT NULL DEFAULT true,
  invoice_item_id UUID REFERENCES public.rgi_invoice_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rgi_time_entries_project ON public.rgi_time_entries(project_id);
CREATE INDEX idx_rgi_time_entries_user ON public.rgi_time_entries(user_id);
CREATE INDEX idx_rgi_time_entries_date ON public.rgi_time_entries(date);
CREATE INDEX idx_rgi_time_entries_invoice_item ON public.rgi_time_entries(invoice_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_time_entries TO authenticated;
GRANT ALL ON public.rgi_time_entries TO service_role;
ALTER TABLE public.rgi_time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_time_entries_admin_all" ON public.rgi_time_entries FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Payments ============
CREATE TABLE public.rgi_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.rgi_invoices(id) ON DELETE CASCADE,
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_rgi_payments_invoice ON public.rgi_payments(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_payments TO authenticated;
GRANT ALL ON public.rgi_payments TO service_role;
ALTER TABLE public.rgi_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_payments_admin_all" ON public.rgi_payments FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Reminders ============
CREATE TABLE public.rgi_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.rgi_invoices(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
  sent_on DATE NOT NULL DEFAULT CURRENT_DATE,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  pdf_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_rgi_reminders_invoice ON public.rgi_reminders(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rgi_reminders TO authenticated;
GRANT ALL ON public.rgi_reminders TO service_role;
ALTER TABLE public.rgi_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rgi_reminders_admin_all" ON public.rgi_reminders FOR ALL TO authenticated
  USING (public.rgi_is_admin(auth.uid())) WITH CHECK (public.rgi_is_admin(auth.uid()));

-- ============ Triggers: updated_at ============
CREATE TRIGGER trg_rgi_company_settings_updated BEFORE UPDATE ON public.rgi_company_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rgi_clients_updated BEFORE UPDATE ON public.rgi_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rgi_projects_updated BEFORE UPDATE ON public.rgi_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rgi_invoices_updated BEFORE UPDATE ON public.rgi_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rgi_time_entries_updated BEFORE UPDATE ON public.rgi_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Sequence generator ============
CREATE OR REPLACE FUNCTION public.rgi_next_invoice_number(p_sparte rgi_sparte DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern TEXT;
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  v_month TEXT := lpad(EXTRACT(MONTH FROM CURRENT_DATE)::TEXT, 2, '0');
  v_scope TEXT;
  v_last INTEGER;
  v_no_str TEXT;
  v_result TEXT;
BEGIN
  IF NOT public.rgi_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT invoice_number_pattern INTO v_pattern FROM public.rgi_company_settings LIMIT 1;
  IF v_pattern IS NULL THEN v_pattern := '{YYYY}-{NNNN}'; END IF;
  v_scope := COALESCE(p_sparte::TEXT, 'default');
  IF position('{SPARTE}' in v_pattern) = 0 THEN v_scope := 'default'; END IF;
  INSERT INTO public.rgi_invoice_sequences (scope, year, last_no)
  VALUES (v_scope, v_year, 1)
  ON CONFLICT (scope, year) DO UPDATE SET last_no = public.rgi_invoice_sequences.last_no + 1
  RETURNING last_no INTO v_last;
  v_no_str := lpad(v_last::TEXT, 4, '0');
  v_result := v_pattern;
  v_result := replace(v_result, '{YYYY}', v_year::TEXT);
  v_result := replace(v_result, '{MM}', v_month);
  v_result := replace(v_result, '{SPARTE}', upper(v_scope));
  v_result := replace(v_result, '{NNNN}', v_no_str);
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rgi_next_invoice_number(rgi_sparte) TO authenticated;

-- ============ Trigger: recompute invoice totals ============
CREATE OR REPLACE FUNCTION public.rgi_recompute_invoice_totals()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_inv UUID;
BEGIN
  v_inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  UPDATE public.rgi_invoices i SET
    subtotal_net = COALESCE((SELECT SUM(line_net)   FROM public.rgi_invoice_items WHERE invoice_id = v_inv), 0),
    vat_total    = COALESCE((SELECT SUM(line_vat)   FROM public.rgi_invoice_items WHERE invoice_id = v_inv), 0),
    total_gross  = COALESCE((SELECT SUM(line_gross) FROM public.rgi_invoice_items WHERE invoice_id = v_inv), 0)
  WHERE i.id = v_inv;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_rgi_invoice_items_totals
AFTER INSERT OR UPDATE OR DELETE ON public.rgi_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.rgi_recompute_invoice_totals();

-- ============ Trigger: payments → paid_amount + status ============
CREATE OR REPLACE FUNCTION public.rgi_recompute_invoice_paid()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_inv UUID; v_paid NUMERIC(12,2); v_total NUMERIC(12,2); v_due DATE;
BEGIN
  v_inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.rgi_payments WHERE invoice_id = v_inv;
  SELECT total_gross, due_date INTO v_total, v_due FROM public.rgi_invoices WHERE id = v_inv;
  UPDATE public.rgi_invoices SET
    paid_amount = v_paid,
    paid_at = CASE WHEN v_paid >= v_total AND v_total > 0 THEN now() ELSE NULL END,
    status = CASE
      WHEN status = 'cancelled' THEN status
      WHEN v_paid >= v_total AND v_total > 0 THEN 'paid'::rgi_invoice_status
      WHEN v_paid > 0 THEN 'partial'::rgi_invoice_status
      WHEN v_due IS NOT NULL AND v_due < CURRENT_DATE AND status IN ('sent','partial') THEN 'overdue'::rgi_invoice_status
      ELSE status
    END
  WHERE id = v_inv;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_rgi_payments_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.rgi_payments
FOR EACH ROW EXECUTE FUNCTION public.rgi_recompute_invoice_paid();

-- ============ Mark overdue (cron) ============
CREATE OR REPLACE FUNCTION public.rgi_mark_overdue()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.rgi_invoices
    SET status = 'overdue'::rgi_invoice_status
    WHERE status IN ('sent','partial')
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.schedule('rgi-mark-overdue-daily', '0 1 * * *', 'SELECT public.rgi_mark_overdue();');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
