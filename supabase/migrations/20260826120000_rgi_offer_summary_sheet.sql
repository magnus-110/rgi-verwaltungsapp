-- Einseitiges Uebersichtsblatt zum Verwaltervertrag.
-- Es wird aus einer eigenen Word-Vorlage (template_kind = 'contract_summary')
-- erzeugt und wie der Vertrag selbst im Bucket 'invoices' abgelegt.
alter table public.offers
  add column if not exists summary_docx_storage_path text,
  add column if not exists summary_pdf_storage_path text;

comment on column public.offers.summary_docx_storage_path is
  'Uebersichtsblatt als Word-Datei, erzeugt aus der Vorlage mit template_kind = contract_summary.';
comment on column public.offers.summary_pdf_storage_path is
  'Uebersichtsblatt als PDF, ueber CloudConvert aus der Word-Datei erzeugt.';
