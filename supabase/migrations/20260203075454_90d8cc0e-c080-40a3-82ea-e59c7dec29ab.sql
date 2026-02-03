-- Junction table for multi-assign: Aufgaben-zu-Personen (n:m)
CREATE TABLE public.todo_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(todo_id, user_id)
);

-- Junction table for multi-assign: Aufgaben-zu-Gebäude (n:m)
CREATE TABLE public.todo_buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(todo_id, building_id)
);

-- Enable RLS
ALTER TABLE public.todo_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_buildings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins and employees can manage todo assignees"
ON public.todo_assignees FOR ALL
USING (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can manage todo buildings"
ON public.todo_buildings FOR ALL
USING (public.user_has_admin_access(auth.uid()));