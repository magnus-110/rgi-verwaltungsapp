
-- Add new columns to invoices table for OCR workflow
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS vendor_iban text,
  ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suggested_account_id uuid REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS ocr_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ocr_error text;

-- Performance indexes for 10k+ invoices
CREATE INDEX IF NOT EXISTS idx_invoices_building_status ON public.invoices (building_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at_desc ON public.invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_ocr_status ON public.invoices (ocr_status);

-- Storage bucket for invoice PDFs (skip if exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('invoices', 'invoices', false, 20971520)
ON CONFLICT (id) DO NOTHING;
