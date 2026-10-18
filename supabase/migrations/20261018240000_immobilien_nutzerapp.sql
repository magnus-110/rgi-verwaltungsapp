-- Immobilien von RGI in der Nutzer-App (vorbereitet, noch AUS).
-- Eigentümer sehen davon nichts, solange rgi_company_settings.portal_immobilien_aktiv = false.
-- RGI-Mitarbeiter sehen die Seiten zur Vorschau trotzdem.

-- 1) Hauptschalter
alter table public.rgi_company_settings add column if not exists portal_immobilien_aktiv boolean not null default false;

-- 2) Feineinstellungen der Freigabe am Objekt
alter table public.broker_properties
  add column if not exists portal_zielgruppe text not null default 'alle',
  add column if not exists portal_orte text[] not null default '{}',
  add column if not exists portal_gebaeude uuid[] not null default '{}',
  add column if not exists portal_bis date,
  add column if not exists portal_startseite boolean not null default false;
alter table public.broker_properties drop constraint if exists broker_properties_portal_zielgruppe_check;
alter table public.broker_properties add constraint broker_properties_portal_zielgruppe_check
  check (portal_zielgruppe in ('alle', 'orte', 'gebaeude'));

-- 3) Gesuche: von RGI (für Kunden) und Suchaufträge von Eigentümern
create table if not exists public.broker_gesuche (
  id uuid primary key default gen_random_uuid(),
  art text not null default 'rgi' check (art in ('rgi', 'eigentuemer')),
  status text not null default 'entwurf' check (status in ('entwurf', 'pruefung', 'sichtbar', 'abgelehnt', 'beendet')),
  titel text not null,
  objektart text,
  ort text,
  umkreis_km integer,
  zimmer_ab numeric,
  flaeche_ab numeric,
  preis_bis numeric,
  beschreibung text,
  fuer_wen text,
  zielgruppe text not null default 'alle' check (zielgruppe in ('alle', 'orte', 'gebaeude')),
  orte text[] not null default '{}',
  gebaeude uuid[] not null default '{}',
  sichtbar_bis date,
  eingestellt_von uuid references auth.users(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  geprueft_von uuid references auth.users(id) on delete set null,
  geprueft_am timestamptz,
  ablehnungsgrund text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists broker_gesuche_status_idx on public.broker_gesuche (status);
create index if not exists broker_gesuche_eingestellt_idx on public.broker_gesuche (eingestellt_von);

alter table public.broker_gesuche enable row level security;
create policy "Makler verwalten Gesuche" on public.broker_gesuche
  for all to authenticated using (public.broker_is_broker()) with check (public.broker_is_broker());

create or replace function public.broker_gesuche_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger broker_gesuche_touch before update on public.broker_gesuche
  for each row execute function public.broker_gesuche_touch();

-- 4) Einstellungen der Eigentümer (beides anfangs aus)
create table if not exists public.owner_portal_einstellungen (
  user_id uuid primary key references auth.users(id) on delete cascade,
  angebote_startseite boolean not null default false,
  angebote_hinweis boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.owner_portal_einstellungen enable row level security;
create policy "Eigene Einstellungen" on public.owner_portal_einstellungen
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 5) Anfragen: wer (App-Nutzer) und zu welchem Gesuch
alter table public.inquiries add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.inquiries add column if not exists gesuch_id uuid references public.broker_gesuche(id) on delete set null;
alter table public.inquiries drop constraint if exists inquiries_kind_check;
alter table public.inquiries add constraint inquiries_kind_check
  check (kind in ('verwaltung', 'bewertung', 'suchauftrag', 'kontakt', 'objekt', 'gesuch'));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'pin_assigned', 'pin_returned', 'subtask_done', 'comment', 'reminder', 'case_email', 'review_due', 'deadline',
  'report_assigned', 'report_reply', 'anfrage', 'makler_interessent', 'mahnung', 'suchauftrag'));
