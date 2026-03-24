
-- ============================================
-- EMAIL INBOX - Phase 1: Database Schema
-- ============================================

-- 1) email_accounts: IMAP/SMTP credentials per mail account
CREATE TABLE public.email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  email_address TEXT NOT NULL UNIQUE,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_user TEXT NOT NULL,
  imap_password TEXT NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  use_ssl BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  delete_after_import BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  last_uid TEXT,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) email_folders: virtual folders/labels
CREATE TABLE public.email_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert system folders
INSERT INTO public.email_folders (name, icon, is_system, sort_order) VALUES
  ('Eingang', 'inbox', true, 0),
  ('Gesendet', 'send', true, 1),
  ('Entwürfe', 'file-edit', true, 2),
  ('Archiv', 'archive', true, 3),
  ('Spam', 'shield-alert', true, 4),
  ('Papierkorb', 'trash-2', true, 5);

-- 3) processes (Vorgänge) - basic structure for future use
CREATE TABLE public.processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) emails: core email table
CREATE TABLE public.emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.email_folders(id) ON DELETE SET NULL,
  message_id_header TEXT,
  in_reply_to TEXT,
  thread_id TEXT,
  imap_uid TEXT,
  subject TEXT,
  from_address TEXT,
  from_name TEXT,
  to_addresses JSONB DEFAULT '[]',
  cc_addresses JSONB DEFAULT '[]',
  bcc_addresses JSONB DEFAULT '[]',
  body_text TEXT,
  body_html TEXT,
  date TIMESTAMPTZ,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_starred BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  is_draft BOOLEAN NOT NULL DEFAULT false,
  has_attachments BOOLEAN NOT NULL DEFAULT false,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  process_id UUID REFERENCES public.processes(id) ON DELETE SET NULL,
  ai_category TEXT,
  ai_summary TEXT,
  ai_priority TEXT DEFAULT 'mittel',
  ai_classified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_emails_account_id ON public.emails(account_id);
CREATE INDEX idx_emails_folder_id ON public.emails(folder_id);
CREATE INDEX idx_emails_building_id ON public.emails(building_id);
CREATE INDEX idx_emails_contact_id ON public.emails(contact_id);
CREATE INDEX idx_emails_date ON public.emails(date DESC);
CREATE INDEX idx_emails_is_read ON public.emails(is_read) WHERE is_read = false;
CREATE INDEX idx_emails_imap_uid ON public.emails(account_id, imap_uid);
CREATE INDEX idx_emails_thread_id ON public.emails(thread_id) WHERE thread_id IS NOT NULL;

-- 5) email_attachments
CREATE TABLE public.email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size BIGINT DEFAULT 0,
  mime_type TEXT,
  content_id TEXT,
  is_inline BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_attachments_email_id ON public.email_attachments(email_id);

-- 6) email_rules: automatic sorting rules
CREATE TABLE public.email_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  condition_field TEXT NOT NULL,
  condition_operator TEXT NOT NULL DEFAULT 'contains',
  condition_value TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'assign_building',
  action_value TEXT,
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.email_folders(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7) RLS Policies
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;

-- Admin/employee access for all email tables
CREATE POLICY "Admins can manage email_accounts" ON public.email_accounts
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage email_folders" ON public.email_folders
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage emails" ON public.emails
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage email_attachments" ON public.email_attachments
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage email_rules" ON public.email_rules
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

CREATE POLICY "Admins can manage processes" ON public.processes
  FOR ALL TO authenticated
  USING (public.user_has_admin_access(auth.uid()))
  WITH CHECK (public.user_has_admin_access(auth.uid()));

-- Updated_at trigger for relevant tables
CREATE TRIGGER update_email_accounts_updated_at BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_emails_updated_at BEFORE UPDATE ON public.emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_rules_updated_at BEFORE UPDATE ON public.email_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_processes_updated_at BEFORE UPDATE ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
