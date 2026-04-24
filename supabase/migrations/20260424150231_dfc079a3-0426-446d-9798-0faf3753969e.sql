-- Process module
CREATE TABLE public.process_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  icon TEXT DEFAULT 'ListChecks',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE TABLE public.process_template_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.process_templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  suggested_offset_days INTEGER,
  default_creates_todo BOOLEAN NOT NULL DEFAULT false,
  default_creates_calendar_event BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.process_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.process_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  owner_user_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.process_instance_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  template_step_id UUID REFERENCES public.process_template_steps(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  assignee_user_id UUID,
  due_date DATE,
  created_todo_id UUID REFERENCES public.todos(id) ON DELETE SET NULL,
  created_calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.process_step_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_step_id UUID NOT NULL REFERENCES public.process_instance_steps(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_process_template_steps_template ON public.process_template_steps(template_id, position);
CREATE INDEX idx_process_instances_building ON public.process_instances(building_id);
CREATE INDEX idx_process_instances_contact ON public.process_instances(contact_id);
CREATE INDEX idx_process_instances_status ON public.process_instances(status);
CREATE INDEX idx_process_instance_steps_instance ON public.process_instance_steps(instance_id, position);

CREATE TRIGGER trg_process_templates_updated_at
  BEFORE UPDATE ON public.process_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_process_template_steps_updated_at
  BEFORE UPDATE ON public.process_template_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_process_instances_updated_at
  BEFORE UPDATE ON public.process_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_process_instance_steps_updated_at
  BEFORE UPDATE ON public.process_instance_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.process_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_template_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_instance_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_step_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view templates" ON public.process_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage templates" ON public.process_templates FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin'::app_role)
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "view template steps" ON public.process_template_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage template steps" ON public.process_template_steps FOR ALL TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin'::app_role)
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "view instances" ON public.process_instances FOR SELECT TO authenticated USING (true);
CREATE POLICY "create instances" ON public.process_instances FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "update instances" ON public.process_instances FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete instances" ON public.process_instances FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "view instance steps" ON public.process_instance_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage instance steps" ON public.process_instance_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "view step attachments" ON public.process_step_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage step attachments" ON public.process_step_attachments FOR ALL TO authenticated
  USING (auth.uid() = uploaded_by OR public.get_user_role(auth.uid()) = 'admin'::app_role)
  WITH CHECK (auth.uid() = uploaded_by);

-- Seed: WEG-Neuaufnahme
DO $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.process_templates (name, description, category, icon)
  VALUES ('WEG-Neuaufnahme','Standardprozess zur Aufnahme einer neuen WEG-Verwaltung','Verwaltungsaufnahme','Building2')
  RETURNING id INTO v_id;

  INSERT INTO public.process_template_steps (template_id, position, title, description, suggested_offset_days) VALUES
    (v_id, 0,  'Verwaltervertrag unterzeichnen', 'Vertrag mit der WEG abschließen und gegenzeichnen', 0),
    (v_id, 1,  'Unterlagen von Vorverwaltung anfordern', 'Vollständige Übergabe-Checkliste an Vorverwaltung senden', 3),
    (v_id, 2,  'Liegenschaft im System anlegen', 'Stammdaten, Einheiten und Eigentümer in der App erfassen', 7),
    (v_id, 3,  'Eigentümer anschreiben', 'Begrüßungsschreiben mit Bankdaten und Kontakt versenden', 10),
    (v_id, 4,  'Bankkonten übernehmen / neu eröffnen', 'Konten auf RGI umschreiben oder neu anlegen', 14),
    (v_id, 5,  'Dienstleister & Versorger informieren', 'Adressänderung an Versorger, Versicherung, Dienstleister', 14),
    (v_id, 6,  'Versicherungen prüfen & ggf. anpassen', 'Gebäudeversicherung, Haftpflicht etc. prüfen', 21),
    (v_id, 7,  'Anfangsbestände & Salden übernehmen', 'Eröffnungsbuchungen, Rücklagen und offene Posten erfassen', 28),
    (v_id, 8,  'Wirtschaftsplan prüfen / erstellen', 'Bestehenden Plan übernehmen oder neu aufstellen', 35),
    (v_id, 9,  'Erste Eigentümerversammlung planen', 'Termin, Agenda und Einladung vorbereiten', 60),
    (v_id, 10, 'Übernahme abschließen & dokumentieren', 'Abschlussprotokoll erstellen und im DMS ablegen', 90);
END $$;