
-- Enums for contact system
CREATE TYPE public.contact_usage_type AS ENUM ('selbstbewohnt', 'zweitwohnsitz', 'vermietet', 'fewo', 'leerstand');
CREATE TYPE public.contact_building_role AS ENUM ('eigentuemer', 'mieter', 'verwalter', 'beirat');
CREATE TYPE public.share_type AS ENUM ('mea', 'einheit', 'qm', 'personen', 'garagen', 'stellplaetze', 'wasser', 'warmwasser', 'heizkosten');
CREATE TYPE public.cost_interval AS ENUM ('monatlich', 'quartal', 'jaehrlich');

-- Main contacts table (global master data)
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_name text,
  salutation text,
  first_name text,
  last_name text,
  company_name text,
  address_street text,
  address_zip text,
  address_city text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contact phones (1:n)
CREATE TABLE public.contact_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  label text DEFAULT 'Mobil',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Contact emails (1:n)
CREATE TABLE public.contact_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  email text NOT NULL,
  label text DEFAULT 'Privat',
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Contact bank accounts (1:n)
CREATE TABLE public.contact_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  account_holder text,
  bank_name text,
  iban text,
  bic text,
  sepa_mandate_ref text,
  sepa_mandate_date date,
  is_default boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contact building assignments (n:m with metadata)
CREATE TABLE public.contact_building_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  unit_number text,
  floor_location text,
  usage_type public.contact_usage_type,
  usage_since date,
  role_in_building public.contact_building_role DEFAULT 'eigentuemer',
  bank_account_id uuid REFERENCES public.contact_bank_accounts(id) ON DELETE SET NULL,
  notes text,
  is_active boolean DEFAULT true,
  valid_from date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contact building shares (distribution keys)
CREATE TABLE public.contact_building_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.contact_building_assignments(id) ON DELETE CASCADE,
  share_type public.share_type NOT NULL,
  share_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contact building costs
CREATE TABLE public.contact_building_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.contact_building_assignments(id) ON DELETE CASCADE,
  cost_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  interval public.cost_interval DEFAULT 'monatlich',
  valid_from date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_building_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_building_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_building_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Admin/Employee can do everything
CREATE POLICY "Admins and employees can manage contacts" ON public.contacts FOR ALL USING (user_has_admin_access(auth.uid()));
CREATE POLICY "Admins and employees can manage contact phones" ON public.contact_phones FOR ALL USING (user_has_admin_access(auth.uid()));
CREATE POLICY "Admins and employees can manage contact emails" ON public.contact_emails FOR ALL USING (user_has_admin_access(auth.uid()));
CREATE POLICY "Admins and employees can manage contact bank accounts" ON public.contact_bank_accounts FOR ALL USING (user_has_admin_access(auth.uid()));
CREATE POLICY "Admins and employees can manage contact building assignments" ON public.contact_building_assignments FOR ALL USING (user_has_admin_access(auth.uid()));
CREATE POLICY "Admins and employees can manage contact building shares" ON public.contact_building_shares FOR ALL USING (user_has_admin_access(auth.uid()));
CREATE POLICY "Admins and employees can manage contact building costs" ON public.contact_building_costs FOR ALL USING (user_has_admin_access(auth.uid()));

-- Updated_at triggers
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contact_bank_accounts_updated_at BEFORE UPDATE ON public.contact_bank_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contact_building_assignments_updated_at BEFORE UPDATE ON public.contact_building_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contact_building_shares_updated_at BEFORE UPDATE ON public.contact_building_shares FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contact_building_costs_updated_at BEFORE UPDATE ON public.contact_building_costs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- SEPA mandate reference generator function
CREATE OR REPLACE FUNCTION public.generate_sepa_mandate_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
  ref_text text;
BEGIN
  IF NEW.sepa_mandate_ref IS NULL OR btrim(NEW.sepa_mandate_ref) = '' THEN
    SELECT COALESCE(MAX(
      CASE WHEN sepa_mandate_ref ~ '^RGI-SEPA-[0-9]{6}$' 
      THEN RIGHT(sepa_mandate_ref, 6)::integer ELSE NULL END
    ), 0) + 1 INTO next_num FROM public.contact_bank_accounts;
    
    NEW.sepa_mandate_ref := 'RGI-SEPA-' || LPAD(next_num::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_sepa_mandate_ref
  BEFORE INSERT ON public.contact_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION generate_sepa_mandate_ref();
