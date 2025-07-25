-- Create separate tables for WEG and Mietverwaltung reports
-- Drop existing reports table and create new ones
DROP TABLE IF EXISTS public.reports;

-- Create WEG reports table
CREATE TABLE public.weg_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  reported_by UUID,
  building_id UUID,
  weg_owner_id UUID,
  -- Contact info (editable)
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_address TEXT,
  -- File attachments
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create Miete reports table
CREATE TABLE public.miete_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  reported_by UUID,
  building_id UUID,
  -- Contact info (prefilled from tenant profile but editable)
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_address TEXT,
  -- File attachments
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weg_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.miete_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for WEG reports
CREATE POLICY "Admins can manage weg reports" 
ON public.weg_reports 
FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "WEG owners can view and create their own reports" 
ON public.weg_reports 
FOR SELECT 
USING (
  get_user_role(auth.uid()) = 'weg_owner'::app_role AND 
  (reported_by = auth.uid() OR weg_owner_id = auth.uid())
);

CREATE POLICY "WEG owners can create reports" 
ON public.weg_reports 
FOR INSERT 
WITH CHECK (
  get_user_role(auth.uid()) = 'weg_owner'::app_role AND 
  reported_by = auth.uid()
);

-- Create policies for Miete reports
CREATE POLICY "Admins can manage miete reports" 
ON public.miete_reports 
FOR ALL 
USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Tenants can view and create their own reports" 
ON public.miete_reports 
FOR SELECT 
USING (
  get_user_role(auth.uid()) = 'tenant'::app_role AND 
  reported_by = auth.uid()
);

CREATE POLICY "Tenants can create reports" 
ON public.miete_reports 
FOR INSERT 
WITH CHECK (
  get_user_role(auth.uid()) = 'tenant'::app_role AND 
  reported_by = auth.uid()
);

-- Create storage bucket for report attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('report-attachments', 'report-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies
CREATE POLICY "Users can upload their own attachments" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'report-attachments' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own attachments" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'report-attachments' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can view all attachments" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'report-attachments' AND 
  get_user_role(auth.uid()) = 'admin'::app_role
);

-- Create triggers for updated_at
CREATE TRIGGER update_weg_reports_updated_at
BEFORE UPDATE ON public.weg_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_miete_reports_updated_at
BEFORE UPDATE ON public.miete_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();