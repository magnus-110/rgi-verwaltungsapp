-- Banken für die Bankzugänge (FinTS) selbst pflegen (03.11.2026)
--
-- Bisher stand die Liste der Banken fest im Code (Funktion "fints",
-- Assistent "Bankzugang hinzufügen", bankInfo). Jetzt können Admins Banken
-- in den Einstellungen hinzufügen, ändern und abschalten.
--
-- blz_muster: Banken mit vielen Filial-Bankleitzahlen (z. B. Commerzbank)
-- stehen nur einmal in der Liste. Das Muster (regulärer Ausdruck auf die
-- 8-stellige BLZ) sagt, welche weiteren Bankleitzahlen dazugehören.
-- Ein genauer Treffer auf blz geht immer vor.

create table if not exists public.fints_banken (
  blz text primary key check (blz ~ '^[0-9]{8}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  bic text check (bic is null or bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  -- nur https, Rechnername mit Punkt (keine IP, kein localhost), höchstens Port 443
  fints_url text not null check (
    length(fints_url) <= 300
    and fints_url ~ '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:443)?(/[^[:space:]@]*)?$'
  ),
  anmeldename_hinweis text check (anmeldename_hinweis is null or length(anmeldename_hinweis) <= 200),
  tan_app text check (tan_app is null or length(tan_app) <= 100),
  blz_muster text check (blz_muster is null or (blz_muster ~ '^\^.*\$$' and length(blz_muster) <= 100)),
  blz_muster_text text check (blz_muster_text is null or length(blz_muster_text) <= 200),
  aktiv boolean not null default true,
  hinzugefuegt_von uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fints_banken is
  'Banken, mit denen Bankzugänge (FinTS, PIN/TAN) eingerichtet werden können. Pflege durch Admins in den Einstellungen.';
comment on column public.fints_banken.blz_muster is
  'Regulärer Ausdruck für weitere Bankleitzahlen derselben Bank (z. B. alle Commerzbank-Filialen).';

-- Ist eine Bank (oder eine ihrer Filial-BLZ) schon für einen Bankzugang im Einsatz?
create or replace function public.fints_bank_in_benutzung(p_blz text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bank_connections c
    join public.fints_banken b on b.blz = p_blz
    where c.blz = b.blz or (b.blz_muster is not null and c.blz ~ b.blz_muster)
  );
$$;
revoke all on function public.fints_bank_in_benutzung(text) from public, anon;
grant execute on function public.fints_bank_in_benutzung(text) to authenticated;

create or replace function public.fints_banken_geaendert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.blz := old.blz; -- BLZ ist der Schlüssel und bleibt
  new.hinzugefuegt_von := old.hinzugefuegt_von;
  new.created_at := old.created_at;
  return new;
end;
$$;
drop trigger if exists fints_banken_geaendert on public.fints_banken;
create trigger fints_banken_geaendert before update on public.fints_banken
  for each row execute function public.fints_banken_geaendert();

-- RLS: lesen alle Büro-Nutzer, schreiben nur Admins (mit Zwei-Faktor-Anmeldung)
alter table public.fints_banken enable row level security;

drop policy if exists fints_banken_lesen on public.fints_banken;
create policy fints_banken_lesen on public.fints_banken
  for select to authenticated using (public.is_rgi_staff());

drop policy if exists fints_banken_anlegen on public.fints_banken;
create policy fints_banken_anlegen on public.fints_banken
  for insert to authenticated
  with check (public.is_rgi_staff() and public.rgi_is_admin(auth.uid()));

drop policy if exists fints_banken_aendern on public.fints_banken;
create policy fints_banken_aendern on public.fints_banken
  for update to authenticated
  using (public.is_rgi_staff() and public.rgi_is_admin(auth.uid()))
  with check (public.is_rgi_staff() and public.rgi_is_admin(auth.uid()));

-- Löschen nur, solange kein Bankzugang daran hängt (sonst abschalten)
drop policy if exists fints_banken_loeschen on public.fints_banken;
create policy fints_banken_loeschen on public.fints_banken
  for delete to authenticated
  using (public.is_rgi_staff() and public.rgi_is_admin(auth.uid()) and not public.fints_bank_in_benutzung(blz));

revoke all on public.fints_banken from anon;
grant select, insert, update, delete on public.fints_banken to authenticated;

-- Startdaten: die bisherigen drei Banken + Commerzbank (alle Filialen)
-- Quellen der FinTS-Adressen:
--  Atruvia (Volks- und Raiffeisenbanken): seit 10/2026 im Einsatz
--  Sparkasse Allgäu: seit 10/2026 im Einsatz
--  Commerzbank: https://www.commerzbank.de/service/kommunikationsadressen-ports-und-oeffentlicher-bankschluessel-fuer-hbci/
--    (FinTS/HBCI PIN/TAN: https://fints.commerzbank.de/fints, Port 443)
insert into public.fints_banken (blz, name, bic, fints_url, anmeldename_hinweis, tan_app, blz_muster, blz_muster_text, hinzugefuegt_von)
values
  ('72090000', 'VR Bank Augsburg-Ostallgäu', 'GENODEF1AUB', 'https://fints1.atruvia.de/cgi-bin/hbciservlet',
    'VR-NetKey oder Alias', 'SecureGo plus', null, null, null),
  ('73350000', 'Sparkasse Allgäu', 'BYLADEM1ALG', 'https://banking-by1.s-fints-pt-by.de/fints30',
    'Anmeldename oder Legitimations-ID', 'S-pushTAN', null, null, null),
  ('73369933', 'Raiffeisenbank Südliches Ostallgäu', 'GENODEF1RHP', 'https://fints1.atruvia.de/cgi-bin/hbciservlet',
    'VR-NetKey oder Alias', 'SecureGo plus', null, null, null),
  ('73340046', 'Commerzbank', 'COBADEFFXXX', 'https://fints.commerzbank.de/fints',
    'Teilnehmernummer', 'Commerzbank photoTAN',
    '^(?!20041)[0-9]{3}4[0-9]{4}$', 'alle Commerzbank-Filialen (4. Stelle der BLZ ist eine 4, ohne comdirect)', null)
on conflict (blz) do nothing;
