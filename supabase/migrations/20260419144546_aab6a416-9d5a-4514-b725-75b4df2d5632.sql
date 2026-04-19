ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS is_company_invoice boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_invoices_is_company_invoice
ON public.invoices(is_company_invoice) WHERE is_company_invoice = true;