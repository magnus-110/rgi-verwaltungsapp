
-- ============ ENUM ============
DO $$ BEGIN
  CREATE TYPE public.key_loan_status AS ENUM ('open', 'returned', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ GLOBAL DROPDOWNS ============
CREATE TABLE public.key_storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.key_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color_hex text,
  code_suffix text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.key_subject_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.key_manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Seeds
INSERT INTO public.key_storage_locations (name, code, sort_order) VALUES
  ('Schließkasten 1','1',1),('Schließkasten 2','2',2),('Keller','K',3);

INSERT INTO public.key_types (name, color_hex, code_suffix, sort_order) VALUES
  ('Grün','#22c55e','G',1),('Rot','#ef4444','R',2);

INSERT INTO public.key_subject_types (name, icon, sort_order) VALUES
  ('Generalschlüssel','key-round',1),
  ('Wohnung','home',2),
  ('Keller','archive',3),
  ('Briefkasten','mail',4),
  ('Garage','car',5),
  ('Haustür','door-open',6);

INSERT INTO public.key_manufacturers (name) VALUES
  ('ABUS'),('IKON'),('MISTER MINIT'),('BKS'),('CES'),('DOM');

-- ============ PER-BUILDING SETTINGS ============
CREATE TABLE public.key_property_settings (
  building_id uuid PRIMARY KEY REFERENCES public.buildings(id) ON DELETE CASCADE,
  property_number text NOT NULL DEFAULT '000',
  closing_plan_path text,
  closing_plan_name text,
  closing_plan_uploaded_at timestamptz,
  closing_plan_uploaded_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ KEY TAGS ============
CREATE TABLE public.key_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  storage_location_id uuid NOT NULL REFERENCES public.key_storage_locations(id),
  key_type_id uuid NOT NULL REFERENCES public.key_types(id),
  sequence_number int NOT NULL,
  tag_number text NOT NULL,
  photo_path text,
  notes text,
  current_loan_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (building_id, key_type_id, sequence_number),
  UNIQUE (tag_number)
);

CREATE INDEX idx_key_tags_building ON public.key_tags(building_id);

-- ============ KEYS ============
CREATE TABLE public.keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES public.key_tags(id) ON DELETE CASCADE,
  subject_type_id uuid REFERENCES public.key_subject_types(id),
  key_number text,
  manufacturer_id uuid REFERENCES public.key_manufacturers(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_keys_tag ON public.keys(tag_id);

-- ============ LOANS ============
CREATE TABLE public.key_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES public.key_tags(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  borrower_contact_id uuid REFERENCES public.contacts(id),
  borrower_name text,
  borrower_email text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  returned_at timestamptz,
  status public.key_loan_status NOT NULL DEFAULT 'open',
  requires_signature boolean NOT NULL DEFAULT false,
  signature_data text,
  send_confirmation_email boolean NOT NULL DEFAULT false,
  send_overdue_reminder boolean NOT NULL DEFAULT false,
  webhook_sent_at timestamptz,
  issued_by_user_id uuid,
  returned_confirmed_by_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_key_loans_tag ON public.key_loans(tag_id);
CREATE INDEX idx_key_loans_building ON public.key_loans(building_id);
CREATE INDEX idx_key_loans_status ON public.key_loans(status);

ALTER TABLE public.key_tags
  ADD CONSTRAINT key_tags_current_loan_fk
  FOREIGN KEY (current_loan_id) REFERENCES public.key_loans(id) ON DELETE SET NULL;

-- ============ EVENTS ============
CREATE TABLE public.key_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES public.key_tags(id) ON DELETE SET NULL,
  key_id uuid REFERENCES public.keys(id) ON DELETE SET NULL,
  loan_id uuid REFERENCES public.key_loans(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_user_id uuid,
  actor_label text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_key_events_building ON public.key_events(building_id, created_at DESC);
CREATE INDEX idx_key_events_tag ON public.key_events(tag_id);

-- ============ TRIGGER FUNCTIONS ============

-- Tag-Number Generator (strikt auto)
CREATE OR REPLACE FUNCTION public.generate_key_tag_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loc_code text;
  v_prop_num text;
  v_suffix text;
  v_next_seq int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Tag-Number ist nicht änderbar
    NEW.tag_number := OLD.tag_number;
    NEW.sequence_number := OLD.sequence_number;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  SELECT code INTO v_loc_code FROM public.key_storage_locations WHERE id = NEW.storage_location_id;
  SELECT code_suffix INTO v_suffix FROM public.key_types WHERE id = NEW.key_type_id;
  SELECT COALESCE(property_number,'000') INTO v_prop_num FROM public.key_property_settings WHERE building_id = NEW.building_id;
  IF v_prop_num IS NULL THEN v_prop_num := '000'; END IF;

  -- nächste lfd Nummer pro (building, key_type)
  SELECT COALESCE(MAX(sequence_number),0)+1 INTO v_next_seq
  FROM public.key_tags
  WHERE building_id = NEW.building_id AND key_type_id = NEW.key_type_id;

  NEW.sequence_number := v_next_seq;
  NEW.tag_number := COALESCE(v_loc_code,'?') || '/' || LPAD(v_prop_num,3,'0') || '-' || LPAD(v_next_seq::text,2,'0') || COALESCE(v_suffix,'');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_key_tag_number
  BEFORE INSERT OR UPDATE ON public.key_tags
  FOR EACH ROW EXECUTE FUNCTION public.generate_key_tag_number();

-- Loan: default due_at +7d, cache current_loan_id
CREATE OR REPLACE FUNCTION public.handle_key_loan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.due_at IS NULL THEN
      NEW.due_at := NEW.issued_at + interval '7 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_key_loan_change
  BEFORE INSERT ON public.key_loans
  FOR EACH ROW EXECUTE FUNCTION public.handle_key_loan_change();

CREATE OR REPLACE FUNCTION public.sync_key_tag_current_loan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'open' THEN
      UPDATE public.key_tags SET current_loan_id = NEW.id, updated_at = now() WHERE id = NEW.tag_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status <> 'open' AND OLD.status = 'open' THEN
      UPDATE public.key_tags SET current_loan_id = NULL, updated_at = now() WHERE id = NEW.tag_id AND current_loan_id = NEW.id;
    ELSIF NEW.status = 'open' AND OLD.status <> 'open' THEN
      UPDATE public.key_tags SET current_loan_id = NEW.id, updated_at = now() WHERE id = NEW.tag_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_key_tag_current_loan
  AFTER INSERT OR UPDATE ON public.key_loans
  FOR EACH ROW EXECUTE FUNCTION public.sync_key_tag_current_loan();

-- Events Logging
CREATE OR REPLACE FUNCTION public.log_key_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_label text;
  v_building uuid;
  v_event text;
  v_payload jsonb := '{}'::jsonb;
BEGIN
  SELECT CONCAT_WS(' ', p.first_name, p.last_name) INTO v_actor_label
    FROM public.profiles p WHERE p.user_id = v_actor LIMIT 1;

  IF TG_TABLE_NAME = 'key_tags' THEN
    v_building := COALESCE(NEW.building_id, OLD.building_id);
    IF TG_OP = 'INSERT' THEN v_event := 'tag_created';
    ELSIF TG_OP = 'UPDATE' THEN
      IF COALESCE(NEW.photo_path,'') <> COALESCE(OLD.photo_path,'') THEN v_event := 'photo_uploaded';
      ELSE v_event := 'tag_updated'; END IF;
    ELSE v_event := 'tag_deleted'; END IF;
    INSERT INTO public.key_events(building_id, tag_id, event_type, actor_user_id, actor_label, payload)
    VALUES (v_building, COALESCE(NEW.id, OLD.id), v_event, v_actor, v_actor_label,
            jsonb_build_object('tag_number', COALESCE(NEW.tag_number, OLD.tag_number)));
  ELSIF TG_TABLE_NAME = 'keys' THEN
    SELECT building_id INTO v_building FROM public.key_tags WHERE id = COALESCE(NEW.tag_id, OLD.tag_id);
    IF TG_OP = 'INSERT' THEN v_event := 'key_added';
    ELSIF TG_OP = 'DELETE' THEN v_event := 'key_removed';
    ELSE v_event := 'key_updated'; END IF;
    INSERT INTO public.key_events(building_id, tag_id, key_id, event_type, actor_user_id, actor_label, payload)
    VALUES (v_building, COALESCE(NEW.tag_id, OLD.tag_id), COALESCE(NEW.id, OLD.id), v_event, v_actor, v_actor_label,
            jsonb_build_object('key_number', COALESCE(NEW.key_number, OLD.key_number)));
  ELSIF TG_TABLE_NAME = 'key_loans' THEN
    v_building := COALESCE(NEW.building_id, OLD.building_id);
    IF TG_OP = 'INSERT' THEN
      v_event := 'loan_issued';
      v_payload := jsonb_build_object(
        'borrower', COALESCE(NEW.borrower_name,''),
        'due_at', NEW.due_at,
        'requires_signature', NEW.requires_signature
      );
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'open' AND NEW.status = 'returned' THEN
      v_event := 'loan_returned';
      v_payload := jsonb_build_object('returned_at', NEW.returned_at);
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'open' AND NEW.status = 'lost' THEN
      v_event := 'loan_lost';
    ELSE
      v_event := 'loan_updated';
    END IF;
    INSERT INTO public.key_events(building_id, tag_id, loan_id, event_type, actor_user_id, actor_label, payload)
    VALUES (v_building, COALESCE(NEW.tag_id, OLD.tag_id), COALESCE(NEW.id, OLD.id), v_event, v_actor, v_actor_label, v_payload);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_log_key_event_tags
  AFTER INSERT OR UPDATE OR DELETE ON public.key_tags
  FOR EACH ROW EXECUTE FUNCTION public.log_key_event();

CREATE TRIGGER trg_log_key_event_keys
  AFTER INSERT OR UPDATE OR DELETE ON public.keys
  FOR EACH ROW EXECUTE FUNCTION public.log_key_event();

CREATE TRIGGER trg_log_key_event_loans
  AFTER INSERT OR UPDATE ON public.key_loans
  FOR EACH ROW EXECUTE FUNCTION public.log_key_event();

-- updated_at trigger for property settings
CREATE OR REPLACE FUNCTION public.touch_key_property_settings()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_touch_key_property_settings
  BEFORE UPDATE ON public.key_property_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_key_property_settings();

-- ============ RLS ============
ALTER TABLE public.key_storage_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_subject_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_manufacturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_property_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_events ENABLE ROW LEVEL SECURITY;

-- Dropdowns: admin/employee voll, andere lesen
CREATE POLICY "kdrop_read_all" ON public.key_storage_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "kdrop_write_admin" ON public.key_storage_locations FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid())) WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "ktypes_read_all" ON public.key_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "ktypes_write_admin" ON public.key_types FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid())) WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "ksubj_read_all" ON public.key_subject_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "ksubj_write_admin" ON public.key_subject_types FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid())) WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "kmfr_read_all" ON public.key_manufacturers FOR SELECT TO authenticated USING (true);
CREATE POLICY "kmfr_write_admin" ON public.key_manufacturers FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid())) WITH CHECK (public.user_has_admin_access(auth.uid()));

-- Per-Building Tabellen
CREATE POLICY "kprop_access" ON public.key_property_settings FOR ALL TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id))
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "ktags_access" ON public.key_tags FOR ALL TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id))
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "keys_access" ON public.keys FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.key_tags t WHERE t.id = keys.tag_id AND public.user_can_access_building(auth.uid(), t.building_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.key_tags t WHERE t.id = keys.tag_id AND public.user_can_access_building(auth.uid(), t.building_id)));

CREATE POLICY "kloans_access" ON public.key_loans FOR ALL TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id))
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

CREATE POLICY "kevents_read" ON public.key_events FOR SELECT TO authenticated
  USING (public.user_can_access_building(auth.uid(), building_id));
CREATE POLICY "kevents_insert_system" ON public.key_events FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_building(auth.uid(), building_id));

-- ============ STORAGE: Bucket key-files (privat) ============
INSERT INTO storage.buckets (id, name, public)
  VALUES ('key-files','key-files', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "key-files admin all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'key-files' AND public.user_has_admin_access(auth.uid()))
  WITH CHECK (bucket_id = 'key-files' AND public.user_has_admin_access(auth.uid()));
