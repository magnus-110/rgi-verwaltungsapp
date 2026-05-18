
CREATE TABLE public.building_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  iban text NOT NULL,
  display_name text,
  coa_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  bank_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, iban)
);

CREATE INDEX idx_building_bank_accounts_building ON public.building_bank_accounts(building_id);
CREATE INDEX idx_building_bank_accounts_iban ON public.building_bank_accounts(iban);

ALTER TABLE public.building_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/Manager können Bankkonten der Liegenschaft sehen"
ON public.building_bank_accounts FOR SELECT TO authenticated
USING (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "Admins/Manager können Bankkonten anlegen"
ON public.building_bank_accounts FOR INSERT TO authenticated
WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "Admins/Manager können Bankkonten ändern"
ON public.building_bank_accounts FOR UPDATE TO authenticated
USING (public.user_can_access_building(auth.uid(), building_id))
WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "Admins/Manager können Bankkonten löschen"
ON public.building_bank_accounts FOR DELETE TO authenticated
USING (public.user_can_access_building(auth.uid(), building_id));

CREATE TRIGGER trg_building_bank_accounts_updated_at
BEFORE UPDATE ON public.building_bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
