
CREATE TABLE public.tenant_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.contact_building_assignments(id) ON DELETE CASCADE,
  deposit_type text NOT NULL CHECK (deposit_type IN ('konto','buergschaft')),
  amount numeric NOT NULL DEFAULT 0,
  bank_name text,
  iban text,
  guarantor text,
  guarantee_number text,
  guarantee_expiry date,
  received_on date,
  released_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_deposits_assignment ON public.tenant_deposits(assignment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_deposits TO authenticated;
GRANT ALL ON public.tenant_deposits TO service_role;

ALTER TABLE public.tenant_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/Employees can view tenant deposits"
ON public.tenant_deposits FOR SELECT TO authenticated
USING (public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE POLICY "Admins/Employees can insert tenant deposits"
ON public.tenant_deposits FOR INSERT TO authenticated
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE POLICY "Admins/Employees can update tenant deposits"
ON public.tenant_deposits FOR UPDATE TO authenticated
USING (public.get_user_role(auth.uid()) IN ('admin','employee'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE POLICY "Admins/Employees can delete tenant deposits"
ON public.tenant_deposits FOR DELETE TO authenticated
USING (public.get_user_role(auth.uid()) IN ('admin','employee'));

CREATE TRIGGER trg_tenant_deposits_updated_at
BEFORE UPDATE ON public.tenant_deposits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
