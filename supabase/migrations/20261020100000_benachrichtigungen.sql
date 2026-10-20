-- E-Mail-Benachrichtigungen für Eigentümer (nur E-Mail).
-- Einstellungen je Nutzer, Ausgang (jede Mail genau einmal) und die Liste
-- der schon bekannten Angebote (damit nur wirklich neue gemeldet werden).

-- 1) Einstellungen: was der Eigentümer per E-Mail bekommen möchte
alter table public.owner_portal_einstellungen
  add column if not exists mail_meldungen boolean not null default true,
  add column if not exists mail_versammlungen boolean not null default true,
  add column if not exists mail_umfragen boolean not null default true,
  add column if not exists mail_dokumente boolean not null default true,
  add column if not exists mail_aushaenge boolean not null default true,
  add column if not exists abmelde_token uuid not null default gen_random_uuid();
create unique index if not exists owner_portal_einstellungen_token on public.owner_portal_einstellungen (abmelde_token);

-- 2) Ausgang: eine Zeile je Mail; (Nutzer, Art, Bezug) verhindert doppelte Mails
create table if not exists public.benachrichtigungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  art text not null,
  ref text not null,
  daten jsonb not null default '{}'::jsonb,
  status text not null default 'offen' check (status in ('offen', 'gesendet', 'uebersprungen', 'fehler')),
  senden_ab timestamptz not null default now(),
  gesendet_am timestamptz,
  fehler text,
  created_at timestamptz not null default now(),
  unique (user_id, art, ref)
);
create index if not exists benachrichtigungen_offen on public.benachrichtigungen (senden_ab) where status = 'offen';
alter table public.benachrichtigungen enable row level security;
create policy "Verwaltung sieht Benachrichtigungen" on public.benachrichtigungen
  for select to authenticated using (public.user_has_admin_access(auth.uid()));

-- 3) Schon bekannte Angebote (erster Lauf übernimmt den Bestand ohne Mail)
create table if not exists public.benachrichtigung_angebote_bekannt (
  property_id uuid primary key,
  seit timestamptz not null default now()
);
alter table public.benachrichtigung_angebote_bekannt enable row level security;

-- 4) Darf ein bestimmter Nutzer ein Angebot sehen? (wie portal_darf_sehen, aber für den Versand)
create or replace function public.portal_darf_sehen_fuer(_uid uuid, _zg text, _orte text[], _geb uuid[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  with meine as (
    select distinct b.id, b.city
      from contacts c
      join contact_building_assignments a on a.contact_id = c.id and a.is_active
      join buildings b on b.id = a.building_id
     where c.user_id = _uid
  )
  select coalesce(_zg, 'alle') = 'alle'
      or (_zg = 'orte' and exists (
            select 1 from meine g where lower(trim(g.city)) in (select lower(trim(x)) from unnest(coalesce(_orte, '{}')) x)))
      or (_zg = 'gebaeude' and exists (select 1 from meine g where g.id = any (coalesce(_geb, '{}'))));
$$;
