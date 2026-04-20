ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS einvoice_format text,
  ADD COLUMN IF NOT EXISTS einvoice_xml_path text,
  ADD COLUMN IF NOT EXISTS leitweg_id text;

CREATE INDEX IF NOT EXISTS idx_invoices_einvoice_format ON public.invoices(einvoice_format) WHERE einvoice_format IS NOT NULL;