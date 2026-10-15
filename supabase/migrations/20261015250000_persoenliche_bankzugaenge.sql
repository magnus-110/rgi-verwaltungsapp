-- Persönliche Bankzugänge für Zahlungen (15.10.2026)
-- Überweisungen und Einzüge laufen nur noch über den eigenen Bankzugang des
-- angemeldeten Nutzers (eigener VR-NetKey, eigene PIN, eigene TAN-App).
-- Zugänge ohne Besitzer (persoenlich_fuer is null) sind Büro-Zugänge und
-- dienen nur dem Abruf der Kontoauszüge.
alter table public.bank_connections
  add column if not exists persoenlich_fuer uuid references auth.users(id) on delete cascade;
create index if not exists bank_connections_persoenlich_idx on public.bank_connections (persoenlich_fuer);

alter policy bank_connections_admin_lesen on public.bank_connections
  using (
    (persoenlich_fuer is null and public.rgi_is_admin(auth.uid()))
    or persoenlich_fuer = auth.uid()
  );
