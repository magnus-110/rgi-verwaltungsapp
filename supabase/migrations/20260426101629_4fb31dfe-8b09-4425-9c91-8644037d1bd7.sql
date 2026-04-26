CREATE TABLE IF NOT EXISTS public.contact_change_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
  bank_account_id uuid,
  change_type text NOT NULL DEFAULT 'iban',
  old_value text,
  new_value text,
  status text NOT NULL DEFAULT 'pending',
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  acknowledge_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccn_status_building ON public.contact_change_notifications(status, building_id);
CREATE INDEX IF NOT EXISTS idx_ccn_status_contact ON public.contact_change_notifications(status, contact_id);

ALTER TABLE public.contact_change_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view change notifications"
ON public.contact_change_notifications FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')));

CREATE POLICY "Staff can update change notifications"
ON public.contact_change_notifications FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role IN ('admin','employee')));

CREATE POLICY "System can insert change notifications"
ON public.contact_change_notifications FOR INSERT TO authenticated
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.notify_iban_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_building_id uuid;
BEGIN
  v_contact_id := NEW.contact_id;
  IF v_contact_id IS NULL AND NEW.person_id IS NOT NULL THEN
    SELECT cp.contact_id INTO v_contact_id FROM public.contact_persons cp WHERE cp.id = NEW.person_id LIMIT 1;
  END IF;
  IF v_contact_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.iban,'') = COALESCE(NEW.iban,'') THEN
    RETURN NEW;
  END IF;

  FOR v_building_id IN
    SELECT DISTINCT building_id FROM public.contact_building_assignments WHERE contact_id = v_contact_id
  LOOP
    INSERT INTO public.contact_change_notifications
      (contact_id, building_id, bank_account_id, change_type, old_value, new_value)
    VALUES
      (v_contact_id, v_building_id, NEW.id, 'iban',
       CASE WHEN TG_OP='UPDATE' THEN OLD.iban ELSE NULL END, NEW.iban);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.contact_building_assignments WHERE contact_id = v_contact_id) THEN
    INSERT INTO public.contact_change_notifications
      (contact_id, building_id, bank_account_id, change_type, old_value, new_value)
    VALUES
      (v_contact_id, NULL, NEW.id, 'iban',
       CASE WHEN TG_OP='UPDATE' THEN OLD.iban ELSE NULL END, NEW.iban);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_iban_change ON public.contact_bank_accounts;
CREATE TRIGGER trg_notify_iban_change
AFTER INSERT OR UPDATE OF iban ON public.contact_bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.notify_iban_change();

-- Owner self-service policies (link via contacts.user_id)
CREATE POLICY "Owners can read own contact"
ON public.contacts FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Owners can update own contact"
ON public.contacts FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Owners can read own persons"
ON public.contact_persons FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_persons.contact_id AND c.user_id = auth.uid()));

CREATE POLICY "Owners can manage own persons"
ON public.contact_persons FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_persons.contact_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_persons.contact_id AND c.user_id = auth.uid()));

CREATE POLICY "Owners can read own phones"
ON public.contact_phones FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_phones.contact_id AND c.user_id = auth.uid()));

CREATE POLICY "Owners can manage own phones"
ON public.contact_phones FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_phones.contact_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_phones.contact_id AND c.user_id = auth.uid()));

CREATE POLICY "Owners can read own emails"
ON public.contact_emails FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_emails.contact_id AND c.user_id = auth.uid()));

CREATE POLICY "Owners can manage own emails"
ON public.contact_emails FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_emails.contact_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_emails.contact_id AND c.user_id = auth.uid()));

CREATE POLICY "Owners can read own bank"
ON public.contact_bank_accounts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_bank_accounts.contact_id AND c.user_id = auth.uid()));

CREATE POLICY "Owners can manage own bank"
ON public.contact_bank_accounts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_bank_accounts.contact_id AND c.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = contact_bank_accounts.contact_id AND c.user_id = auth.uid()));