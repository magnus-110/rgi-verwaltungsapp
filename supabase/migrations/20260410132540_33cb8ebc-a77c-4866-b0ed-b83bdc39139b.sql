ALTER TABLE public.booking_templates 
  ADD COLUMN linked_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN amount_tolerance numeric DEFAULT NULL;