-- Notizbuch: dauerhaftes Büro-Wissen zum Nachschlagen.
--
-- Regeln (so mit Magnus abgestimmt, 14.10.2026):
--   * Eine Notiz gehört zu einem Gebäude ODER zu einem Bereich. Eine
--     Gebäude-Notiz kann zusätzlich einen Bereich als Thema haben (ETV,
--     Buchhaltung, Technik …).
--   * Bereiche gelten für alle Gebäude und werden selbst angelegt. Die
--     bisherigen Themen der Gebäude-Notizen werden zu Bereichen.
--   * Nutzen dürfen das Notizbuch Admins UND Mitarbeiter
--     (user_has_admin_access). Eigentümer und Mieter sehen es nie.
--   * "Für alle" sieht und bearbeitet das ganze Büro, "nur für mich" nur
--     der, der die Notiz angelegt hat.
--   * Ein Bereich lässt sich nur löschen, wenn er leer ist.
--
-- Die bisherigen Tabellen building_notes / building_note_categories werden
-- hier nur KOPIERT, nicht gelöscht. Sie bleiben als Sicherung stehen; die
-- App liest sie nicht mehr.

-- ------------------------------------------------------------------ Bereiche
create table if not exists public.notebook_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  color text not null default '#6b6869',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists notebook_areas_name_unique
  on public.notebook_areas (lower(btrim(name)));

comment on table public.notebook_areas is
  'Notizbuch: selbst angelegte Bereiche. Gelten für alle Gebäude, dienen bei Gebäude-Notizen als Thema.';

-- ------------------------------------------------------------------ Notizen
create table if not exists public.notebook_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  -- Inhalt als HTML aus dem Editor. Wird beim Anzeigen bereinigt.
  content text not null default '',
  -- Bereich löschen geht nur, wenn er leer ist -> restrict
  area_id uuid references public.notebook_areas(id) on delete restrict,
  building_id uuid references public.buildings(id) on delete cascade,
  is_private boolean not null default false,
  pinned boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Herkunft aus der alten Tabelle, damit die Übernahme nachvollziehbar bleibt
  legacy_building_note_id uuid unique,
  -- Für die Suche: Titel und Text ohne HTML
  search_text text generated always as (
    title || ' ' || regexp_replace(content, '<[^>]+>', ' ', 'g')
  ) stored,
  constraint notebook_notes_zuordnung check (area_id is not null or building_id is not null)
);

comment on table public.notebook_notes is
  'Notizbuch: Notizen gehören zu einem Gebäude oder einem Bereich (Gebäude-Notizen optional zusätzlich mit Bereich als Thema).';

create index if not exists idx_notebook_notes_building on public.notebook_notes (building_id);
create index if not exists idx_notebook_notes_area on public.notebook_notes (area_id);
create index if not exists idx_notebook_notes_updated on public.notebook_notes (updated_at desc);

-- ------------------------------------------------------------------ Anhänge
create table if not exists public.notebook_attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notebook_notes(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size bigint,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notebook_attachments_note on public.notebook_attachments (note_id);

-- ------------------------------------------------------- geändert von / am
create or replace function public.notebook_notes_touch()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_notebook_notes_touch on public.notebook_notes;
create trigger trg_notebook_notes_touch
  before update on public.notebook_notes
  for each row execute function public.notebook_notes_touch();

-- --------------------------------------------------------------- Sichtbarkeit
create or replace function public.notebook_can_see(p_note_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.user_has_admin_access(p_user)
    and exists (
      select 1 from public.notebook_notes n
      where n.id = p_note_id
        and (not n.is_private or n.created_by = p_user)
    );
$$;

grant execute on function public.notebook_can_see(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------- RLS
alter table public.notebook_areas enable row level security;
alter table public.notebook_notes enable row level security;
alter table public.notebook_attachments enable row level security;

drop policy if exists "Notizbuch Bereiche Büro" on public.notebook_areas;
create policy "Notizbuch Bereiche Büro"
  on public.notebook_areas
  for all
  using (public.user_has_admin_access(auth.uid()))
  with check (public.user_has_admin_access(auth.uid()));

drop policy if exists "Notizbuch Notizen lesen" on public.notebook_notes;
create policy "Notizbuch Notizen lesen"
  on public.notebook_notes
  for select
  using (
    public.user_has_admin_access(auth.uid())
    and (not is_private or created_by = auth.uid())
  );

drop policy if exists "Notizbuch Notizen anlegen" on public.notebook_notes;
create policy "Notizbuch Notizen anlegen"
  on public.notebook_notes
  for insert
  with check (
    public.user_has_admin_access(auth.uid())
    and created_by = auth.uid()
  );

drop policy if exists "Notizbuch Notizen ändern" on public.notebook_notes;
create policy "Notizbuch Notizen ändern"
  on public.notebook_notes
  for update
  using (
    public.user_has_admin_access(auth.uid())
    and (not is_private or created_by = auth.uid())
  )
  with check (
    public.user_has_admin_access(auth.uid())
    -- "nur für mich" darf nur der Ersteller einstellen
    and (not is_private or created_by = auth.uid())
  );

drop policy if exists "Notizbuch Notizen löschen" on public.notebook_notes;
create policy "Notizbuch Notizen löschen"
  on public.notebook_notes
  for delete
  using (
    public.user_has_admin_access(auth.uid())
    and (not is_private or created_by = auth.uid())
  );

drop policy if exists "Notizbuch Anhänge" on public.notebook_attachments;
create policy "Notizbuch Anhänge"
  on public.notebook_attachments
  for all
  using (public.notebook_can_see(note_id, auth.uid()))
  with check (public.notebook_can_see(note_id, auth.uid()));

grant select, insert, update, delete on public.notebook_areas to authenticated;
grant select, insert, update, delete on public.notebook_notes to authenticated;
grant select, insert, update, delete on public.notebook_attachments to authenticated;
grant all on public.notebook_areas to service_role;
grant all on public.notebook_notes to service_role;
grant all on public.notebook_attachments to service_role;

-- ------------------------------------------------------------------ Speicher
insert into storage.buckets (id, name, public)
values ('notebook', 'notebook', false)
on conflict (id) do nothing;

drop policy if exists "Notizbuch Dateien hochladen" on storage.objects;
create policy "Notizbuch Dateien hochladen"
  on storage.objects
  for insert
  with check (
    bucket_id = 'notebook'
    and public.user_has_admin_access(auth.uid())
  );

drop policy if exists "Notizbuch Dateien lesen" on storage.objects;
create policy "Notizbuch Dateien lesen"
  on storage.objects
  for select
  using (
    bucket_id = 'notebook'
    and public.user_has_admin_access(auth.uid())
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.notebook_attachments a
        where a.file_path = storage.objects.name
          and public.notebook_can_see(a.note_id, auth.uid())
      )
    )
  );

drop policy if exists "Notizbuch Dateien löschen" on storage.objects;
create policy "Notizbuch Dateien löschen"
  on storage.objects
  for delete
  using (
    bucket_id = 'notebook'
    and public.user_has_admin_access(auth.uid())
    and (
      owner = auth.uid()
      or not exists (select 1 from public.notebook_attachments a where a.file_path = storage.objects.name)
      or exists (
        select 1 from public.notebook_attachments a
        where a.file_path = storage.objects.name
          and public.notebook_can_see(a.note_id, auth.uid())
      )
    )
  );

-- ------------------------------------------- Übernahme der Gebäude-Notizen
-- Themen -> Bereiche. Standard-Themen bekommen feste Farben, eigene Themen
-- (bisher je Gebäude) werden zu Bereichen für alle Gebäude.
with themen as (
  select distinct
    case n.category
      when 'etv' then 'ETV'
      when 'buchhaltung' then 'Buchhaltung'
      when 'technik' then 'Technik'
      else coalesce(
        (select c.label from public.building_note_categories c
          where c.building_id = n.building_id and c.value = n.category limit 1),
        n.category
      )
    end as name
  from public.building_notes n
  where coalesce(btrim(n.category), '') <> ''
  union
  select 'ETV' union select 'Buchhaltung' union select 'Technik'
)
insert into public.notebook_areas (name, color, created_by)
select
  t.name,
  case t.name
    when 'ETV' then '#d6650b'
    when 'Buchhaltung' then '#3e6ea8'
    when 'Technik' then '#3f8a6c'
    else (array['#8a5cb0', '#8a7a55', '#b5483a', '#6b6869'])[1 + (abs(hashtext(t.name)) % 4)]
  end,
  null
from (select distinct on (lower(btrim(name))) name from themen) t
on conflict do nothing;

insert into public.notebook_notes (
  title, content, area_id, building_id, created_by, updated_by,
  created_at, updated_at, legacy_building_note_id
)
select
  coalesce(
    nullif(btrim(n.title), ''),
    nullif(left(btrim(split_part(btrim(n.content), E'\n', 1)), 80), ''),
    'Notiz'
  ),
  '<p>' || replace(
    replace(replace(replace(btrim(n.content), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
    E'\n', '</p><p>'
  ) || '</p>',
  a.id,
  n.building_id,
  (select u.id from auth.users u where u.id = n.created_by),
  (select u.id from auth.users u where u.id = n.created_by),
  n.created_at,
  coalesce(n.updated_at, n.created_at),
  n.id
from public.building_notes n
left join lateral (
  select ar.id from public.notebook_areas ar
  where lower(btrim(ar.name)) = lower(btrim(
    case n.category
      when 'etv' then 'ETV'
      when 'buchhaltung' then 'Buchhaltung'
      when 'technik' then 'Technik'
      else coalesce(
        (select c.label from public.building_note_categories c
          where c.building_id = n.building_id and c.value = n.category limit 1),
        n.category
      )
    end
  ))
  limit 1
) a on true
where n.building_id is not null
on conflict (legacy_building_note_id) do nothing;

comment on table public.building_notes is
  'ALT – seit 14.10.2026 ins Notizbuch (notebook_notes) übernommen. Nur noch Sicherung, die App liest sie nicht mehr.';
comment on table public.building_note_categories is
  'ALT – seit 14.10.2026 als Bereiche ins Notizbuch (notebook_areas) übernommen. Nur noch Sicherung.';
