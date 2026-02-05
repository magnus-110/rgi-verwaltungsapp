-- Calendar Events Table
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  
  -- Time fields
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ,
  is_all_day BOOLEAN DEFAULT false,
  
  -- Link to todo (optional)
  todo_id UUID REFERENCES public.todos(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  
  -- Category (same as todos)
  category_id UUID REFERENCES public.todo_categories(id) ON DELETE SET NULL,
  
  -- Optional custom color (overrides category color)
  color TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Recurrence (same pattern as todos)
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT CHECK (recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_interval INTEGER DEFAULT 1,
  recurrence_end_date DATE
);

-- Junction table: Events to Users (many-to-many)
CREATE TABLE public.calendar_event_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Junction table: Events to Buildings (many-to-many)
CREATE TABLE public.calendar_event_buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, building_id)
);

-- Extend todos table for calendar integration
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS show_in_calendar BOOLEAN DEFAULT false;
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS calendar_start_time TIME;
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS calendar_end_time TIME;

-- Enable RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_buildings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for calendar_events
CREATE POLICY "Admins and employees can view calendar events"
ON public.calendar_events FOR SELECT
USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can create calendar events"
ON public.calendar_events FOR INSERT
WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can update calendar events"
ON public.calendar_events FOR UPDATE
USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can delete calendar events"
ON public.calendar_events FOR DELETE
USING (public.user_has_admin_access(auth.uid()));

-- RLS Policies for calendar_event_assignees
CREATE POLICY "Admins and employees can manage event assignees"
ON public.calendar_event_assignees FOR ALL
USING (public.user_has_admin_access(auth.uid()));

-- RLS Policies for calendar_event_buildings
CREATE POLICY "Admins and employees can manage event buildings"
ON public.calendar_event_buildings FOR ALL
USING (public.user_has_admin_access(auth.uid()));

-- Updated_at trigger for calendar_events
CREATE TRIGGER update_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();