-- Create report templates table
CREATE TABLE public.report_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  management_mode management_mode NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  category text
);

-- Enable RLS for report templates
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to manage report templates
CREATE POLICY "Admins can manage report templates" 
ON public.report_templates 
FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_report_templates_updated_at
BEFORE UPDATE ON public.report_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();