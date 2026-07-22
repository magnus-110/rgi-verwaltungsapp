-- =====================================================================
--  Eigentümer-Umfrage (Priorisierung von Maßnahmen)  – WEG-Modul
--  Ablage: supabase/migrations/<timestamp>_survey_feature.sql
--  Konventionen: RLS an, Gebäude-Isolation, Owner ↔ contacts.user_id,
--  MEA aus contact_building_shares (share_type = 'mea').
-- =====================================================================

-- ---------- ENUMs ----------
do $$ begin
  create type survey_status as enum ('draft','open','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type survey_choice as enum ('ja','neutral','nein');
exception when duplicate_object then null; end $$;

-- ---------- Tabellen ----------
create table if not exists public.surveys (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  title        text not null,
  description  text,
  status       survey_status not null default 'draft',
  opens_at     timestamptz,
  closes_at    timestamptz,
  -- Beteiligungsschwelle (Anteil teilnehmender MEA), ab der das Ergebnis als belastbar gilt
  quorum_pct   numeric not null default 40,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.survey_items (
  id                 uuid primary key default gen_random_uuid(),
  survey_id          uuid not null references public.surveys(id) on delete cascade,
  position           int  not null default 0,
  group_label        text,                          -- z. B. "Außen & Sicherheit"
  title              text not null,
  explanation        text not null,
  cost_tier          text,                          -- "1", "1–2", "4", "offen"
  is_safety          boolean not null default false, -- true = Pflicht/Verkehrssicherung → KEINE Abstimmung
  followup_question  text,
  followup_options   text[],                        -- z. B. {'Metall','Acrylglas'}
  on_agenda          boolean,                        -- finale Verwaltungs-Entscheidung: auf die TO? (NULL = noch offen)
  agenda_note        text,                           -- kurze Begründung der Verwaltung
  created_at         timestamptz not null default now()
);

create table if not exists public.survey_item_images (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.survey_items(id) on delete cascade,
  storage_path   text not null,                     -- Pfad im Bucket 'survey-images'
  caption        text,
  position       int not null default 0,
  -- optionale Herkunft aus dem DMS (falls Bild aus building_files übernommen wurde)
  source_file_id uuid references public.building_files(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists public.survey_votes (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.survey_items(id) on delete cascade,
  survey_id       uuid not null references public.surveys(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  building_id     uuid not null references public.buildings(id) on delete cascade,
  choice          survey_choice,                    -- NULL bei Info-/Sicherheitspunkten
  followup_choice int,                              -- Index in survey_items.followup_options
  urgent          boolean not null default false,
  comment         text,
  mea_weight      numeric not null default 0,       -- Snapshot des Stimmgewichts (MEA) bei Abgabe
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (item_id, contact_id)                      -- eine Stimme pro Eigentümer & Punkt
);

create index if not exists idx_survey_items_survey on public.survey_items(survey_id, position);
create index if not exists idx_survey_votes_item   on public.survey_votes(item_id);
create index if not exists idx_survey_votes_survey on public.survey_votes(survey_id);

-- =====================================================================
--  Helfer
-- =====================================================================

-- Contact-ID des eingeloggten Eigentümers
create or replace function public.current_contact_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.contacts where user_id = auth.uid() limit 1;
$$;

-- MEA-Stimmgewicht des eingeloggten Eigentümers für ein Gebäude
create or replace function public.current_owner_mea(_building uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(cbs.share_value), 0)
  from public.contact_building_assignments cba
  join public.contact_building_shares cbs
    on cbs.assignment_id = cba.id and cbs.share_type = 'mea'
  where cba.building_id = _building
    and cba.contact_id  = public.current_contact_id()
    and cba.role_in_building = 'eigentuemer';
$$;

-- Gesamt-MEA eines Gebäudes (für Beteiligungs-/Prozentberechnung)
create or replace function public.building_total_mea(_building uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(cbs.share_value), 0)
  from public.contact_building_assignments cba
  join public.contact_building_shares cbs
    on cbs.assignment_id = cba.id and cbs.share_type = 'mea'
  where cba.building_id = _building
    and cba.role_in_building = 'eigentuemer';
$$;

-- RGI-Mitarbeiter/Verwaltung (Rollen wie in AdminLayout: 'admin' | 'employee')
create or replace function public.is_rgi_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role::text in ('admin','employee')
  );
$$;

-- Beim Speichern einer Stimme: Eigentümer, Gebäude & MEA serverseitig setzen (nicht manipulierbar)
create or replace function public.survey_vote_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare _building uuid;
begin
  select building_id into _building from public.surveys where id = new.survey_id;
  new.contact_id  := public.current_contact_id();
  new.building_id := _building;
  new.mea_weight  := public.current_owner_mea(_building);
  new.updated_at  := now();
  if new.contact_id is null then
    raise exception 'Kein Eigentümer-Kontakt für den angemeldeten Benutzer gefunden.';
  end if;
  return new;
end $$;

drop trigger if exists trg_survey_vote_fill on public.survey_votes;
create trigger trg_survey_vote_fill
  before insert or update on public.survey_votes
  for each row execute function public.survey_vote_fill();

-- =====================================================================
--  Ergebnis-View (Zugriff im Client zusätzlich per is_rgi_staff() absichern)
-- =====================================================================
create or replace view public.survey_item_results as
select
  i.id                as item_id,
  i.survey_id,
  i.title,
  i.is_safety,
  count(v.id) filter (where v.choice is not null)                as votes_count,
  count(*)   filter (where v.choice = 'ja')                      as head_ja,
  count(*)   filter (where v.choice = 'neutral')                 as head_neutral,
  count(*)   filter (where v.choice = 'nein')                    as head_nein,
  coalesce(sum(v.mea_weight) filter (where v.choice='ja'),0)     as mea_ja,
  coalesce(sum(v.mea_weight) filter (where v.choice='neutral'),0) as mea_neutral,
  coalesce(sum(v.mea_weight) filter (where v.choice='nein'),0)   as mea_nein,
  count(*)   filter (where v.urgent)                             as urgent_count
from public.survey_items i
left join public.survey_votes v on v.item_id = i.id
group by i.id;

-- View mit Aufrufer-Rechten: RLS der survey_votes greift, Eigentümer sehen keine fremden Aggregate.
alter view public.survey_item_results set (security_invoker = on);

-- =====================================================================
--  RLS
-- =====================================================================
alter table public.surveys            enable row level security;
alter table public.survey_items       enable row level security;
alter table public.survey_item_images enable row level security;
alter table public.survey_votes       enable row level security;

create policy surveys_select_owner on public.surveys for select using (
  status <> 'draft'
  and exists (select 1 from public.weg_owner_buildings w
              where w.user_id = auth.uid() and w.building_id = surveys.building_id)
);
create policy surveys_all_staff on public.surveys for all
  using (public.is_rgi_staff()) with check (public.is_rgi_staff());

create policy items_select on public.survey_items for select using (
  exists (select 1 from public.surveys s where s.id = survey_items.survey_id
          and ( public.is_rgi_staff()
             or (s.status <> 'draft' and exists (
                   select 1 from public.weg_owner_buildings w
                   where w.user_id = auth.uid() and w.building_id = s.building_id)) ))
);
create policy items_write_staff on public.survey_items for all
  using (public.is_rgi_staff()) with check (public.is_rgi_staff());

create policy images_select on public.survey_item_images for select using (
  exists (select 1 from public.survey_items i join public.surveys s on s.id = i.survey_id
          where i.id = survey_item_images.item_id
          and ( public.is_rgi_staff()
             or (s.status <> 'draft' and exists (
                   select 1 from public.weg_owner_buildings w
                   where w.user_id = auth.uid() and w.building_id = s.building_id)) ))
);
create policy images_write_staff on public.survey_item_images for all
  using (public.is_rgi_staff()) with check (public.is_rgi_staff());

create policy votes_select_own on public.survey_votes for select using (
  contact_id = public.current_contact_id() or public.is_rgi_staff()
);
create policy votes_insert_own on public.survey_votes for insert with check (
  exists (select 1 from public.surveys s where s.id = survey_id and s.status = 'open')
);
create policy votes_update_own on public.survey_votes for update using (
  contact_id = public.current_contact_id()
  and exists (select 1 from public.surveys s where s.id = survey_id and s.status = 'open')
);

revoke all on public.survey_item_results from anon;
grant select on public.survey_item_results to authenticated;

-- =====================================================================
--  Storage-Bucket für Umfrage-Bilder (privat → signierte URLs)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('survey-images','survey-images', false)
on conflict (id) do nothing;

create policy "survey-images staff write" on storage.objects for all
  using (bucket_id = 'survey-images' and public.is_rgi_staff())
  with check (bucket_id = 'survey-images' and public.is_rgi_staff());

create policy "survey-images owner read" on storage.objects for select
  using (bucket_id = 'survey-images' and auth.role() = 'authenticated');
                                        