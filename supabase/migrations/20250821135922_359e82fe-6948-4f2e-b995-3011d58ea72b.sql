-- Create storage bucket for forum attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('forum-attachments', 'forum-attachments', false);

-- Create RLS policies for forum attachments
CREATE POLICY "Authenticated users can view forum attachments"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'forum-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Admins can upload forum attachments"
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'forum-attachments' AND get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update forum attachments"
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'forum-attachments' AND get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can delete forum attachments"
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'forum-attachments' AND get_user_role(auth.uid()) = 'admin');

-- Create forum post templates table
CREATE TABLE public.forum_post_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  management_mode management_mode NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on templates table
ALTER TABLE public.forum_post_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for templates
CREATE POLICY "Admins can manage forum templates"
ON public.forum_post_templates 
FOR ALL 
USING (get_user_role(auth.uid()) = 'admin');

-- Add attachments column to forum_posts table
ALTER TABLE public.forum_posts 
ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;

-- Create trigger for updated_at on templates
CREATE TRIGGER update_forum_post_templates_updated_at
  BEFORE UPDATE ON public.forum_post_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default templates
INSERT INTO public.forum_post_templates (title, content, management_mode) VALUES
('Müllplan', 'Liebe Mieter/Eigentümer,

anbei der aktuelle Müllplan für das [Jahr]:

Restmüll: [Tage]
Gelbe Tonne: [Tage]  
Papier: [Tage]
Biotonne: [Tage]

Bitte beachten Sie die Abholzeiten und stellen Sie die Tonnen rechtzeitig bereit.

Mit freundlichen Grüßen
Ihre Hausverwaltung', 'weg'),

('Müllplan', 'Liebe Mieter,

anbei der aktuelle Müllplan für das [Jahr]:

Restmüll: [Tage]
Gelbe Tonne: [Tage]
Papier: [Tage]
Biotonne: [Tage]

Bitte beachten Sie die Abholzeiten und stellen Sie die Tonnen rechtzeitig bereit.

Mit freundlichen Grüßen  
Ihre Hausverwaltung', 'rent'),

('Wichtige Telefonnummern', 'Wichtige Kontaktdaten für [Gebäude]:

Hausverwaltung:
Telefon: [Telefon]
E-Mail: [E-Mail]
Notfall: [Notfall-Nr]

Hausmeister:
Telefon: [Telefon]
E-Mail: [E-Mail]

Technische Dienste:
Heizung: [Telefon]
Sanitär: [Telefon]
Elektrik: [Telefon]

Bei Notfällen außerhalb der Geschäitszeiten wenden Sie sich bitte an [Notfallkontakt].', 'weg'),

('Wichtige Telefonnummern', 'Wichtige Kontaktdaten für [Gebäude]:

Hausverwaltung:
Telefon: [Telefon]
E-Mail: [E-Mail]
Notfall: [Notfall-Nr]

Hausmeister:
Telefon: [Telefon]
E-Mail: [E-Mail]

Technische Dienste:
Heizung: [Telefon]
Sanitär: [Telefon]
Elektrik: [Telefon]

Bei Notfällen außerhalb der Geschäftszeiten wenden Sie sich bitte an [Notfallkontakt].', 'rent'),

('Allgemeine Ankündigung', '[Betreff]

Liebe Mieter/Eigentümer,

[Inhalt der Ankündigung]

Datum: [Datum]
Uhrzeit: [Uhrzeit]  
Ort: [Ort]

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Ihre Hausverwaltung', 'weg'),

('Allgemeine Ankündigung', '[Betreff]

Liebe Mieter,

[Inhalt der Ankündigung]

Datum: [Datum]
Uhrzeit: [Uhrzeit]
Ort: [Ort]

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Ihre Hausverwaltung', 'rent');