-- ============================================================================
-- COMMUNICATION MODULE: Serial Letters & Bulk Emails
-- ============================================================================

-- 1. Templates table
CREATE TABLE public.comm_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('letter', 'email')),
  subject TEXT,
  body_html TEXT,
  docx_path TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comm_templates_building ON public.comm_templates(building_id);
CREATE INDEX idx_comm_templates_type ON public.comm_templates(type);

-- 2. Campaigns table
CREATE TABLE public.comm_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('letter', 'email')),
  template_id UUID REFERENCES public.comm_templates(id) ON DELETE SET NULL,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  recipient_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generating', 'done', 'sending', 'sent', 'failed')),
  email_account_id UUID,
  subject_override TEXT,
  body_html_override TEXT,
  docx_path_override TEXT,
  free_vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_zip_path TEXT,
  result_pdf_path TEXT,
  error_message TEXT,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_comm_campaigns_building ON public.comm_campaigns(building_id);
CREATE INDEX idx_comm_campaigns_status ON public.comm_campaigns(status);
CREATE INDEX idx_comm_campaigns_created_at ON public.comm_campaigns(created_at DESC);

-- 3. Recipients table (status per recipient)
CREATE TABLE public.comm_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.comm_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  person_id UUID,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  display_name TEXT,
  email TEXT,
  resolved_vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'sent', 'failed', 'skipped')),
  error TEXT,
  generated_file_path TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comm_recipients_campaign ON public.comm_recipients(campaign_id);
CREATE INDEX idx_comm_recipients_status ON public.comm_recipients(status);

-- 4. Updated_at triggers
CREATE TRIGGER trg_comm_templates_updated_at
  BEFORE UPDATE ON public.comm_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_comm_campaigns_updated_at
  BEFORE UPDATE ON public.comm_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Enable RLS
ALTER TABLE public.comm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comm_recipients ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies — authenticated users (admins/verwalter) have full access
CREATE POLICY "Authenticated users can view templates"
  ON public.comm_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert templates"
  ON public.comm_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can update templates"
  ON public.comm_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete templates"
  ON public.comm_templates FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view campaigns"
  ON public.comm_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert campaigns"
  ON public.comm_campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can update campaigns"
  ON public.comm_campaigns FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete campaigns"
  ON public.comm_campaigns FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view recipients"
  ON public.comm_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert recipients"
  ON public.comm_recipients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update recipients"
  ON public.comm_recipients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete recipients"
  ON public.comm_recipients FOR DELETE TO authenticated USING (true);

-- 7. Storage bucket for templates and generated files
INSERT INTO storage.buckets (id, name, public)
VALUES ('comm-assets', 'comm-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can view comm-assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comm-assets');

CREATE POLICY "Authenticated users can upload comm-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comm-assets');

CREATE POLICY "Authenticated users can update comm-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'comm-assets');

CREATE POLICY "Authenticated users can delete comm-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'comm-assets');