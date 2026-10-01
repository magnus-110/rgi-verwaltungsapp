-- Büro-Ablage: ein gemeinsamer Ablagekorb für das Büroteam.
--
-- Zweck: Wer zusammen im Büro sitzt, soll sich Dateien und kurze Notizen nicht
-- per E-Mail schicken müssen. Man legt etwas hinein, die Kollegen sehen es
-- sofort, und wer es erledigt hat, löscht es wieder.
--
-- Regeln (so mit Magnus abgestimmt, 01.10.2026):
--   * Nutzen dürfen die Ablage Admins UND Mitarbeiter (user_has_admin_access).
--     Mieter und Eigentümer sehen sie nie.
--   * Standard ist "für alle". Optional "nur für" bestimmte Personen — dann
--     sehen den Eintrag nur der Absender und diese Personen.
--   * Jeder, der einen Eintrag sehen darf, darf ihn auch löschen.
--   * Es wird NICHT automatisch aufgeräumt.
--
-- Die Dateien liegen in einem eigenen, privaten Speicherbereich 'office-drop',
-- getrennt von den Objektdokumenten.

-- ------------------------------------------------------------------ Tabellen
create table if not exists public.office_drop_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('file', 'note')),
  -- Notiztext bzw. Kommentar zur Datei ("Bitte bis Freitag prüfen")
  note text,
  file_path text unique,
  file_name text,
  mime_type text,
  file_size bigint,
  -- Woher kommt der Eintrag? Nur zur Anzeige.
  source text not null default 'upload' check (source in ('upload', 'email', 'paste')),
  source_email_id uuid,
  -- leer = für alle; sonst nur für diese Personen (plus Absender)
  recipient_ids uuid[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint office_drop_items_inhalt check (
    (kind = 'file' and file_path is not null and file_name is not null)
    or (kind = 'note' and coalesce(btrim(note), '') <> '')
  )
);

comment on table public.office_drop_items is
  'Büro-Ablage: Dateien und Notizen, die sich das Büroteam gegenseitig hinlegt.';
comment on column public.office_drop_items.recipient_ids is
  'Leer = für alle im Büro. Sonst sehen den Eintrag nur diese Personen und der Absender.';

create index if not exists idx_office_drop_items_created
  on public.office_drop_items (created_at desc);
create index if not exists idx_office_drop_items_recipients
  on public.office_drop_items using gin (recipient_ids);

-- Wer hat welchen Eintrag schon gesehen? (für den "Neu"-Punkt und die Zahl oben)
create table if not exists public.office_drop_reads (
  item_id uuid not null references public.office_drop_items(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

-- --------------------------------------------------------------- Sichtbarkeit
-- Eine Stelle für die Regel "wer darf diesen Eintrag sehen".
create or replace function public.office_drop_can_see(
  p_created_by uuid,
  p_recipient_ids uuid[],
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.user_has_admin_access(p_user)
    and (
      coalesce(cardinality(p_recipient_ids), 0) = 0
      or p_created_by = p_user
      or p_user = any(p_recipient_ids)
    );
$$;

grant execute on function public.office_drop_can_see(uuid, uuid[], uuid) to authenticated;

-- ------------------------------------------------------------------- RLS
alter table public.office_drop_items enable row level security;
alter table public.office_drop_reads enable row level security;

drop policy if exists "Büro-Ablage lesen" on public.office_drop_items;
create policy "Büro-Ablage lesen"
  on public.office_drop_items
  for select
  using (public.office_drop_can_see(created_by, recipient_ids, auth.uid()));

drop policy if exists "Büro-Ablage einlegen" on public.office_drop_items;
create policy "Büro-Ablage einlegen"
  on public.office_drop_items
  for insert
  with check (
    public.user_has_admin_access(auth.uid())
    and created_by = auth.uid()
  );

-- Jeder, der den Eintrag sieht, darf ihn löschen.
drop policy if exists "Büro-Ablage löschen" on public.office_drop_items;
create policy "Büro-Ablage löschen"
  on public.office_drop_items
  for delete
  using (public.office_drop_can_see(created_by, recipient_ids, auth.uid()));

drop policy if exists "Büro-Ablage eigene Gelesen-Marken" on public.office_drop_reads;
create policy "Büro-Ablage eigene Gelesen-Marken"
  on public.office_drop_reads
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.user_has_admin_access(auth.uid()));

grant select, insert, delete on public.office_drop_items to authenticated;
grant select, insert, update, delete on public.office_drop_reads to authenticated;
grant all on public.office_drop_items to service_role;
grant all on public.office_drop_reads to service_role;

-- --------------------------------------------------------------- Live-Update
-- Damit neue Einträge bei den Kollegen sofort erscheinen.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'office_drop_items'
  ) then
    alter publication supabase_realtime add table public.office_drop_items;
  end if;
exception when undefined_object then
  -- Publikation gibt es (lokal) nicht — dann eben ohne Live-Update.
  null;
end $$;

-- ------------------------------------------------------------------ Speicher
insert into storage.buckets (id, name, public)
values ('office-drop', 'office-drop', false)
on conflict (id) do nothing;

-- Hochladen: jeder im Büro. Lesen und Löschen: nur wer den zugehörigen
-- Eintrag sehen darf. Eine Datei ohne Eintrag (gerade im Hochladen) darf nur
-- der sehen, der sie hochgeladen hat.
drop policy if exists "Büro-Ablage Dateien hochladen" on storage.objects;
create policy "Büro-Ablage Dateien hochladen"
  on storage.objects
  for insert
  with check (
    bucket_id = 'office-drop'
    and public.user_has_admin_access(auth.uid())
  );

drop policy if exists "Büro-Ablage Dateien lesen" on storage.objects;
create policy "Büro-Ablage Dateien lesen"
  on storage.objects
  for select
  using (
    bucket_id = 'office-drop'
    and public.user_has_admin_access(auth.uid())
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.office_drop_items i
        where i.file_path = storage.objects.name
          and public.office_drop_can_see(i.created_by, i.recipient_ids, auth.uid())
      )
    )
  );

drop policy if exists "Büro-Ablage Dateien löschen" on storage.objects;
create policy "Büro-Ablage Dateien löschen"
  on storage.objects
  for delete
  using (
    bucket_id = 'office-drop'
    and public.user_has_admin_access(auth.uid())
    and (
      owner = auth.uid()
      or not exists (select 1 from public.office_drop_items i where i.file_path = storage.objects.name)
      or exists (
        select 1 from public.office_drop_items i
        where i.file_path = storage.objects.name
          and public.office_drop_can_see(i.created_by, i.recipient_ids, auth.uid())
      )
    )
  );
