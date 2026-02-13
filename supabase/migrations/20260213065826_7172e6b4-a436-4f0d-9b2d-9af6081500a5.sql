
-- Tabelle: maintenance_configs (Wartungskonfiguration pro Gebäude)
CREATE TABLE public.maintenance_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  custom_interval_months INTEGER,
  custom_lead_time_days INTEGER,
  last_generated_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(building_id, maintenance_type)
);

-- RLS aktivieren
ALTER TABLE public.maintenance_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins and employees can manage maintenance configs"
  ON public.maintenance_configs FOR ALL
  USING (user_has_admin_access(auth.uid()));

-- Neue Spalten in todos für Wartungsaufgaben
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS show_in_list_date DATE,
  ADD COLUMN IF NOT EXISTS maintenance_type TEXT,
  ADD COLUMN IF NOT EXISTS is_maintenance_task BOOLEAN NOT NULL DEFAULT false;

-- Index für effiziente Abfragen
CREATE INDEX idx_todos_maintenance ON public.todos (is_maintenance_task, show_in_list_date) WHERE is_maintenance_task = true;
CREATE INDEX idx_maintenance_configs_building ON public.maintenance_configs (building_id);

-- Trigger für updated_at
CREATE TRIGGER update_maintenance_configs_updated_at
  BEFORE UPDATE ON public.maintenance_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
