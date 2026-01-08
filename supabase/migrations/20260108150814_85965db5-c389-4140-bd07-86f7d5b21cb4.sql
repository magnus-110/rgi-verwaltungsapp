-- Create prompt_categories table
CREATE TABLE public.prompt_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT 'folder',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create prompt_templates table
CREATE TABLE public.prompt_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.prompt_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create prompt_favorites table (per-user favorites)
CREATE TABLE public.prompt_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES public.prompt_templates(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, prompt_id)
);

-- Enable RLS
ALTER TABLE public.prompt_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_favorites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for prompt_categories
CREATE POLICY "Everyone can view categories" ON public.prompt_categories
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage categories" ON public.prompt_categories
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- RLS Policies for prompt_templates (all prompts visible to everyone)
CREATE POLICY "Everyone can view prompts" ON public.prompt_templates
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage prompts" ON public.prompt_templates
  FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- RLS Policies for prompt_favorites (users manage their own favorites)
CREATE POLICY "Users can view own favorites" ON public.prompt_favorites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own favorites" ON public.prompt_favorites
  FOR ALL USING (auth.uid() = user_id);

-- Insert default categories
INSERT INTO public.prompt_categories (name, icon, sort_order) VALUES
  ('Mietrecht', 'scale', 1),
  ('Nebenkosten', 'receipt', 2),
  ('WEG', 'building-2', 3),
  ('Allgemein', 'message-circle', 4);

-- Insert default prompts
INSERT INTO public.prompt_templates (category_id, title, content) VALUES
  ((SELECT id FROM public.prompt_categories WHERE name = 'Mietrecht'), 'Mietminderung prüfen', 'Unter welchen Umständen darf ein Mieter die Miete mindern und wie hoch darf die Minderung sein?'),
  ((SELECT id FROM public.prompt_categories WHERE name = 'Mietrecht'), 'Kündigungsfristen', 'Erkläre mir die gesetzlichen Kündigungsfristen für Mietverträge.'),
  ((SELECT id FROM public.prompt_categories WHERE name = 'Nebenkosten'), 'Abrechnung erklären', 'Erkläre mir die wichtigsten Punkte einer Nebenkostenabrechnung.'),
  ((SELECT id FROM public.prompt_categories WHERE name = 'Nebenkosten'), 'Umlagefähige Kosten', 'Welche Kosten sind auf Mieter umlagefähig und welche nicht?'),
  ((SELECT id FROM public.prompt_categories WHERE name = 'WEG'), 'Sonderumlage', 'Was ist eine Sonderumlage und wann kann sie beschlossen werden?'),
  ((SELECT id FROM public.prompt_categories WHERE name = 'WEG'), 'Eigentümerversammlung', 'Welche Rechte habe ich als Eigentümer in einer Eigentümerversammlung?'),
  ((SELECT id FROM public.prompt_categories WHERE name = 'Allgemein'), 'Zusammenfassen', 'Fasse den folgenden Text kurz und verständlich zusammen:'),
  ((SELECT id FROM public.prompt_categories WHERE name = 'Allgemein'), 'Einfach erklären', 'Erkläre mir den folgenden Sachverhalt einfach und verständlich:');