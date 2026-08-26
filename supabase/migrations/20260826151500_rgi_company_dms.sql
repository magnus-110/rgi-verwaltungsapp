-- Firmen-Dokumentenablage fuer RGI Intern.
--
-- Die Firma bekommt bewusst KEIN Schein-Gebaeude in `buildings`: Liegenschaften
-- werden an rund 70 Stellen abgefragt (Berichte, Finanzen, Chatbot, Wartung),
-- ein zusaetzlicher Datensatz wuerde dort ueberall mitlaufen und Zahlen
-- verfaelschen. Stattdessen laeuft die Firma als zweite Dimension neben
-- `building_id` -- genau wie es der Makler-Bereich mit `broker_property_id`
-- schon macht.
--
-- Zugriff: nur Rollen 'admin' (rgi_is_admin), ausdruecklich NICHT 'employee'.

-- ---------------------------------------------------------------- Kennzeichen
alter table public.building_files
  add column if not exists is_company boolean not null default false;

alter table public.building_file_categories
  add column if not exists is_company boolean not null default false;

create index if not exists idx_building_files_is_company
  on public.building_files (is_company, created_at desc)
  where is_company = true;

create index if not exists idx_building_file_categories_is_company
  on public.building_file_categories (is_company, sort_order)
  where is_company = true;

comment on column public.building_files.is_company is
  'true = Dokument der Firma RGI (kein Liegenschaftsbezug). building_id bleibt dann NULL.';
comment on column public.building_file_categories.is_company is
  'true = Ordner der Firmenablage. building_id bleibt dann NULL.';

-- ------------------------------------------------------------- Standardordner
-- Idempotent, wird beim Oeffnen des Reiters "Dokumente" aufgerufen.
create or replace function public.ensure_rgi_categories()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_folder record;
begin
  if not public.rgi_is_admin(auth.uid()) then
    raise exception 'Nur Administratoren duerfen die Firmenablage einrichten';
  end if;

  for v_folder in
    select * from (values
      ('rgi-angebote',      'Angebote',                  10),
      ('rgi-marketing',     'Marketing',                 20),
      ('rgi-vertraege',     'Verträge & Versicherungen', 30),
      ('rgi-buchhaltung',   'Buchhaltung',               40),
      ('rgi-personal',      'Personal',                  50),
      ('rgi-sonstiges',     'Sonstiges',                 60)
    ) as t(slug, name, sort_order)
  loop
    if not exists (
      select 1 from public.building_file_categories
      where is_company = true and slug = v_folder.slug
    ) then
      insert into public.building_file_categories
        (name, slug, building_id, is_company, management_mode, sort_order)
      values
        (v_folder.name, v_folder.slug, null, true, 'weg'::management_mode, v_folder.sort_order);
    end if;
  end loop;
end;
$$;

comment on function public.ensure_rgi_categories() is
  'Legt die Standardordner der RGI-Firmenablage an, falls sie fehlen. Nur fuer Administratoren.';

grant execute on function public.ensure_rgi_categories() to authenticated;

-- --------------------------------------------------------------- Tabellen-RLS
-- Die bestehende Admin-/Mitarbeiter-Policy wird auf Liegenschaftsdokumente
-- eingegrenzt, damit Mitarbeiter Firmendokumente nicht sehen. Die Sichten fuer
-- Mieter und Eigentuemer bleiben unveraendert -- sie verlangen ohnehin
-- `building_id IN (...)` und greifen bei Firmenzeilen (building_id IS NULL)
-- nicht.
drop policy if exists "Admins and employees can manage building files" on public.building_files;
create policy "Admins and employees can manage building files"
  on public.building_files
  for all
  using (public.user_has_admin_access(auth.uid()) and is_company = false)
  with check (public.user_has_admin_access(auth.uid()) and is_company = false);

drop policy if exists "RGI admins manage company files" on public.building_files;
create policy "RGI admins manage company files"
  on public.building_files
  for all
  using (is_company = true and public.rgi_is_admin(auth.uid()))
  with check (is_company = true and public.rgi_is_admin(auth.uid()));

drop policy if exists "Admins and employees can manage file categories" on public.building_file_categories;
create policy "Admins and employees can manage file categories"
  on public.building_file_categories
  for all
  using (public.user_has_admin_access(auth.uid()) and is_company = false)
  with check (public.user_has_admin_access(auth.uid()) and is_company = false);

drop policy if exists "Authenticated users can view file categories" on public.building_file_categories;
create policy "Authenticated users can view file categories"
  on public.building_file_categories
  for select
  using (auth.uid() is not null and is_company = false);

drop policy if exists "RGI admins manage company categories" on public.building_file_categories;
create policy "RGI admins manage company categories"
  on public.building_file_categories
  for all
  using (is_company = true and public.rgi_is_admin(auth.uid()))
  with check (is_company = true and public.rgi_is_admin(auth.uid()));

-- ---------------------------------------------------------------- Storage-RLS
-- Firmendateien liegen im bestehenden Bucket 'building-files' unter dem Praefix
-- 'rgi/'. Dieser Praefix wird aus den allgemeinen Policies herausgenommen und
-- eigenen, strengeren Policies unterstellt.
drop policy if exists "Authenticated users can read building files" on storage.objects;
create policy "Authenticated users can read building files"
  on storage.objects
  for select
  using (
    bucket_id = 'building-files'
    and auth.uid() is not null
    and name not like 'rgi/%'
  );

drop policy if exists "Admins can upload building files" on storage.objects;
create policy "Admins can upload building files"
  on storage.objects
  for insert
  with check (
    bucket_id = 'building-files'
    and public.user_has_admin_access(auth.uid())
    and name not like 'rgi/%'
  );

drop policy if exists "Admins can update building files" on storage.objects;
create policy "Admins can update building files"
  on storage.objects
  for update
  using (
    bucket_id = 'building-files'
    and public.user_has_admin_access(auth.uid())
    and name not like 'rgi/%'
  );

drop policy if exists "Admins can delete building files" on storage.objects;
create policy "Admins can delete building files"
  on storage.objects
  for delete
  using (
    bucket_id = 'building-files'
    and public.user_has_admin_access(auth.uid())
    and name not like 'rgi/%'
  );

drop policy if exists "RGI admins read company files" on storage.objects;
create policy "RGI admins read company files"
  on storage.objects
  for select
  using (
    bucket_id = 'building-files'
    and name like 'rgi/%'
    and public.rgi_is_admin(auth.uid())
  );

drop policy if exists "RGI admins upload company files" on storage.objects;
create policy "RGI admins upload company files"
  on storage.objects
  for insert
  with check (
    bucket_id = 'building-files'
    and name like 'rgi/%'
    and public.rgi_is_admin(auth.uid())
  );

drop policy if exists "RGI admins update company files" on storage.objects;
create policy "RGI admins update company files"
  on storage.objects
  for update
  using (
    bucket_id = 'building-files'
    and name like 'rgi/%'
    and public.rgi_is_admin(auth.uid())
  );

drop policy if exists "RGI admins delete company files" on storage.objects;
create policy "RGI admins delete company files"
  on storage.objects
  for delete
  using (
    bucket_id = 'building-files'
    and name like 'rgi/%'
    and public.rgi_is_admin(auth.uid())
  );
