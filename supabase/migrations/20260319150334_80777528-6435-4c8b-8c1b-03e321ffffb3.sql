ALTER TABLE public.invoices ADD COLUMN review_status text NOT NULL DEFAULT 'open';
UPDATE public.invoices SET review_status = 'verified' WHERE status = 'verified';
UPDATE public.invoices SET status = 'open' WHERE status = 'verified';