-- 1. Create todo_categories table
CREATE TABLE public.todo_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(user_id)
);

-- 2. Create todos table with all features
CREATE TABLE public.todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_number SERIAL,
  title TEXT NOT NULL,
  description TEXT,
  
  -- Kategorisierung
  category_id UUID REFERENCES public.todo_categories(id) ON DELETE SET NULL,
  
  -- Zuweisung (OPTIONAL - kann NULL sein)
  assigned_to UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  
  -- Zeitangaben
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  
  -- Status und Priorität
  priority TEXT NOT NULL DEFAULT 'medium' 
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' 
    CHECK (status IN ('open', 'in_progress', 'done')),
  
  -- Gebäudebezug (optional)
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  
  -- Dateianhänge (JSONB-Array)
  attachments JSONB DEFAULT '[]'::jsonb,
  
  -- Wiederkehrend
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT CHECK (recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_interval INTEGER DEFAULT 1,
  recurrence_end_date DATE,
  parent_todo_id UUID REFERENCES public.todos(id) ON DELETE SET NULL
);

-- 3. Create todo_subtasks table
CREATE TABLE public.todo_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  sort_order INTEGER DEFAULT 0
);

-- 4. Create todo_comments table
CREATE TABLE public.todo_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id UUID NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create indexes for performance
CREATE INDEX idx_todos_assigned_to ON public.todos(assigned_to);
CREATE INDEX idx_todos_status ON public.todos(status);
CREATE INDEX idx_todos_due_date ON public.todos(due_date);
CREATE INDEX idx_todos_category ON public.todos(category_id);
CREATE INDEX idx_todos_created_by ON public.todos(created_by);
CREATE INDEX idx_todo_subtasks_todo_id ON public.todo_subtasks(todo_id);
CREATE INDEX idx_todo_comments_todo_id ON public.todo_comments(todo_id);

-- 6. Enable RLS on all tables
ALTER TABLE public.todo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todo_comments ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
CREATE POLICY "Admins and employees can manage todo categories"
ON public.todo_categories FOR ALL
USING (user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can manage todos"
ON public.todos FOR ALL
USING (user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can manage todo subtasks"
ON public.todo_subtasks FOR ALL
USING (user_has_admin_access(auth.uid()));

CREATE POLICY "Admins and employees can manage todo comments"
ON public.todo_comments FOR ALL
USING (user_has_admin_access(auth.uid()));

-- 8. Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('todo-attachments', 'todo-attachments', false);

-- 9. Create storage RLS policy
CREATE POLICY "Admins and employees can manage todo attachments"
ON storage.objects FOR ALL
USING (bucket_id = 'todo-attachments' AND user_has_admin_access(auth.uid()));

-- 10. Create updated_at trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION public.update_todos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Create trigger for updated_at
CREATE TRIGGER update_todos_updated_at
BEFORE UPDATE ON public.todos
FOR EACH ROW
EXECUTE FUNCTION public.update_todos_updated_at();

-- 12. Create trigger function for recurring todos
CREATE OR REPLACE FUNCTION public.handle_recurring_todo_completion()
RETURNS TRIGGER AS $$
DECLARE
  next_due DATE;
BEGIN
  -- Only process when status changes to 'done' and task is recurring
  IF NEW.status = 'done' AND NEW.is_recurring = true AND OLD.status != 'done' AND NEW.due_date IS NOT NULL THEN
    -- Calculate next due date
    next_due := CASE NEW.recurrence_pattern
      WHEN 'daily' THEN NEW.due_date + (NEW.recurrence_interval || ' days')::interval
      WHEN 'weekly' THEN NEW.due_date + (NEW.recurrence_interval * 7 || ' days')::interval
      WHEN 'monthly' THEN NEW.due_date + (NEW.recurrence_interval || ' months')::interval
      WHEN 'yearly' THEN NEW.due_date + (NEW.recurrence_interval || ' years')::interval
      ELSE NULL
    END;
    
    -- Only create next occurrence if within end date (or no end date)
    IF next_due IS NOT NULL AND (NEW.recurrence_end_date IS NULL OR next_due <= NEW.recurrence_end_date) THEN
      INSERT INTO public.todos (
        title, description, category_id, assigned_to, created_by,
        priority, building_id, is_recurring, recurrence_pattern,
        recurrence_interval, recurrence_end_date, parent_todo_id,
        due_date, attachments
      )
      VALUES (
        NEW.title, NEW.description, NEW.category_id, NEW.assigned_to, NEW.created_by,
        NEW.priority, NEW.building_id, NEW.is_recurring, NEW.recurrence_pattern,
        NEW.recurrence_interval, NEW.recurrence_end_date,
        COALESCE(NEW.parent_todo_id, NEW.id),
        next_due, NEW.attachments
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 13. Create trigger for recurring todos
CREATE TRIGGER handle_recurring_todo_completion
AFTER UPDATE ON public.todos
FOR EACH ROW
EXECUTE FUNCTION public.handle_recurring_todo_completion();