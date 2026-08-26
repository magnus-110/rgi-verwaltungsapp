-- Ablageort je Dokument.
--
-- Bisher wurde der Bucket aus `source` erraten ('invoice' -> invoices, sonst
-- building-files). Das reicht nicht mehr: Angebotsdokumente liegen im Bucket
-- `invoices` unter `offers/...`, sind aber keine Rechnungen. Statt weiter zu
-- raten haelt die Zeile den Bucket jetzt selbst. Ist die Spalte leer, gilt
-- unveraendert die alte Ableitung -- Bestandsdaten bleiben damit gueltig.
alter table public.building_files
  add column if not exists storage_bucket text;

comment on column public.building_files.storage_bucket is
  'Bucket, in dem file_path liegt. NULL = aus source ableiten (invoice -> invoices, sonst building-files).';
